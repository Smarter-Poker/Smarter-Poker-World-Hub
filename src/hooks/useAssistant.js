/**
 * Personal Assistant Hooks
 * Provides data fetching for Strategy Hub, Virtual Sandbox, and Leak Finder
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';

// Helper to get auth token from Supabase session
async function getAuthToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// useAssistantStats — Fetch user's assistant statistics
// ═══════════════════════════════════════════════════════════════════════════

export function useAssistantStats() {
  const [stats, setStats] = useState({
    sessionsReviewed: 0,
    handsAnalyzed: 0,
    leaksFound: 0,
    sandboxSessions: 0,
    avgEvLoss: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
        const user = getAuthUser();
        const token = await getAuthToken();

        const response = await fetch('/api/assistant/stats', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await response.json();

        if (data.success) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();

    // 🔄 BUS LISTENER for real-time Stat updates
    const handleUpdate = () => fetchStats();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => window.removeEventListener('pa-data-updated', handleUpdate);
  }, []);

  return { stats, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════════════════
// useLeaks — Fetch user's detected leaks
// ═══════════════════════════════════════════════════════════════════════════

export function useLeaks(statusFilter = null) {
  const [leaks, setLeaks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLeaks = useCallback(async () => {
    try {
      setIsLoading(true);
      // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
      const user = getAuthUser();
      const token = await getAuthToken();

      let url = '/api/assistant/leaks';
      if (statusFilter) {
        url += `?status=${statusFilter}`;
      }

      const response = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();

      if (data.success) {
        // Transform API response to match UI format
        const formattedLeaks = data.leaks.map(leak => ({
          id: leak.id,
          title: formatLeakTitle(leak.leak_type),
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
        }));
        setLeaks(formattedLeaks);
      }
    } catch (err) {
      console.error('Error fetching leaks:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLeaks();

    // 🔄 BUS LISTENER for real-time Leak updates
    const handleUpdate = () => fetchLeaks();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => window.removeEventListener('pa-data-updated', handleUpdate);
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
      console.error('Error updating leak:', err);
      return { success: false, error: err.message };
    }
  };

  return { leaks, isLoading, error, refetch: fetchLeaks, updateLeakStatus };
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

export function useArchetypes() {
  const [archetypes, setArchetypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchArchetypes() {
      try {
        const response = await fetch('/api/assistant/archetypes');
        const data = await response.json();

        if (data.success) {
          setArchetypes(data.archetypes);
        }
      } catch (err) {
        console.error('Error fetching archetypes:', err);
        // Use defaults
        setArchetypes([
          { id: 'gto_neutral', name: 'GTO Neutral', color: '#6b7280' },
          { id: 'tight_passive', name: 'Tight Passive', color: '#3b82f6' },
          { id: 'loose_passive', name: 'Calling Station', color: '#22c55e' },
          { id: 'tight_aggressive', name: 'Tight Agg', color: '#f59e0b' },
          { id: 'loose_aggressive', name: 'LAG', color: '#ef4444' },
          { id: 'over_bluffer', name: 'Over-Bluffer', color: '#ec4899' },
          { id: 'under_bluffer', name: 'Under-Bluffer', color: '#8b5cf6' },
          { id: 'fit_or_fold', name: 'Fit-or-Fold', color: '#64748b' },
          { id: 'icm_scared', name: 'ICM-Scared', color: '#0ea5e9' },
          { id: 'icm_pressure', name: 'ICM-Pressure', color: '#dc2626' },
        ]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchArchetypes();
  }, []);

  return { archetypes, isLoading };
}

// ═══════════════════════════════════════════════════════════════════════════
// useSandboxAnalysis — Run GTO analysis
// ═══════════════════════════════════════════════════════════════════════════

export function useSandboxAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const analyze = useCallback(async (params) => {
    try {
      setIsAnalyzing(true);
      setError(null);

      // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
      const token = await getAuthToken();

      const response = await fetch('/api/assistant/sandbox/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(params)
      });

      const data = await response.json();

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

          // Metadata
          source: data.source,
          matchTier: data.matchTier,
          confidence: data.confidence,
          street: data.street,
          context: data.context,

          // Legacy compatibility
          primaryAction: data.optimalAction?.label,
          primaryFrequency: data.optimalAction?.frequency,
          alternatives: data.actions?.filter(a => !a.isOptimal) || [],
          whyNot: data.explanation,
        });

        // 📢 Dispatch BUS LISTENER update (Sandbox affects Stats)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
      } else {
        setError(data.error || 'Analysis failed');
      }

      return data;
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return { analyze, isAnalyzing, results, error, clearResults };
}

// ═══════════════════════════════════════════════════════════════════════════
// useRecentSessions — Fetch recent sandbox sessions
// ═══════════════════════════════════════════════════════════════════════════

export function useRecentSessions(limit = 10) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
      const user = getAuthUser();
      if (!user) {
        // Return demo sessions for non-logged-in users
        setSessions([
          { id: 1, title: 'MP vs BTN Single Raised Pot', stack: '100BB', evLoss: -0.14, type: 'sandbox' },
          { id: 2, title: 'Post-Session Leak Analysis', date: 'Yesterday', evLoss: -0.11, type: 'leak' },
        ]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('sandbox_sessions')
        .select(`
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
          created_at,
          sandbox_results (
            primary_action,
            primary_frequency
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching sessions:', error);
        setSessions([]);
      } else {
        const formatted = (data || []).map(s => ({
          id: s.id,
          title: `${s.hero_position} with ${s.hero_hand}`,
          stack: `${s.hero_stack_bb}BB`,
          hero_stack: s.hero_stack_bb, // Raw numeric value for restore
          hero_position: s.hero_position,
          hero_hand: s.hero_hand,
          game_type: s.game_type,
          evLoss: 0, // Would need actual EV data
          type: 'sandbox',
          date: s.created_at,
          result: s.sandbox_results?.[0]?.primary_action,
          // Full restoration fields
          board_flop: s.board_flop,
          board_turn: s.board_turn,
          board_river: s.board_river,
          villain_config: s.villain_config,
          action_history: s.action_history,
          pot_size_bb: s.pot_size_bb,
        }));
        setSessions(formatted);
      }
    } catch (err) {
      console.error('Fetch sessions error:', err);
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchSessions();

    // 🔄 BUS LISTENER for real-time Session updates
    const handleUpdate = () => fetchSessions();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => window.removeEventListener('pa-data-updated', handleUpdate);
  }, [fetchSessions]);

  return { sessions, isLoading, refetch: fetchSessions };
}

// ═══════════════════════════════════════════════════════════════════════════
// useBookmarks — Fetch saved sandbox bookmarks
// ═══════════════════════════════════════════════════════════════════════════

export function useBookmarks(limit = 15) {
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBookmarks = useCallback(async () => {
    try {
      setIsLoading(true);
      const user = getAuthUser();

      if (!user) {
        // Fallback to localStorage for guests
        if (typeof window !== 'undefined') {
          const stored = JSON.parse(localStorage.getItem('sandbox_bookmarks') || '[]');
          setBookmarks(stored.slice(0, limit).map(b => ({
            ...b,
            title: b.label || 'Saved Scenario',
            stack: `${b.hero_stack || 100}BB`,
            type: 'bookmark',
            villain_config: typeof b.villains === 'string' ? JSON.parse(b.villains) : b.villains,
            action_history: typeof b.action_history === 'string' ? JSON.parse(b.action_history) : b.action_history,
          })));
        } else {
          setBookmarks([]);
        }
        setIsLoading(false);
        return;
      }

      const token = await getAuthToken();
      const { data, error } = await supabase
        .from('sandbox_bookmarks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching bookmarks:', error);
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
          villain_config: typeof b.villain_config === 'string' ? JSON.parse(b.villain_config) : b.villain_config,
          action_history: typeof b.action_history === 'string' ? JSON.parse(b.action_history) : b.action_history,
          pot_size_bb: b.pot_size_bb,
        }));
        setBookmarks(formatted);
      }
    } catch (err) {
      console.error('Fetch bookmarks error:', err);
      setBookmarks([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchBookmarks();

    // 🔄 BUS LISTENER for real-time Bookmark updates
    const handleUpdate = () => fetchBookmarks();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => window.removeEventListener('pa-data-updated', handleUpdate);
  }, [fetchBookmarks]);

  return { bookmarks, isLoading, refetch: fetchBookmarks };
}

// ═══════════════════════════════════════════════════════════════════════════
// useLeakDetection — Trigger leak detection analysis
// ═══════════════════════════════════════════════════════════════════════════

export function useLeakDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [error, setError] = useState(null);

  const runDetection = useCallback(async () => {
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
        body: JSON.stringify({})
      });

      const data = await response.json();

      if (data.success) {
        setDetectionResult({
          handsAnalyzed: data.handsAnalyzed,
          leaksDetected: data.leaksDetected,
          leaks: data.leaks,
        });

        // 📢 Dispatch BUS LISTENER update (Leak finding affects Stats and Leak lists)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
      } else {
        setError(data.error || 'Detection failed');
      }

      return data;
    } catch (err) {
      console.error('Leak detection error:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsDetecting(false);
    }
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

  const fetchExamples = useCallback(async () => {
    if (!leakId) return;

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
          situation_snapshot,
          ev_loss_bb,
          created_at,
          hand_history_id
        `)
        .eq('leak_id', leakId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (fetchError) {
        console.error('Error fetching leak examples:', fetchError);
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

      setExamples(formatted);
    } catch (err) {
      console.error('Fetch examples error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [leakId]);

  useEffect(() => {
    if (leakId) {
      fetchExamples();
    }
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
          console.error('Training sessions fetch error:', sessionsError);
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

        const categoryProgress = Object.entries(categoryMap).map(([category, data]) => ({
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
        console.error('Error fetching training stats:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTrainingStats();
  }, []);

  return { stats, isLoading, error };
}
