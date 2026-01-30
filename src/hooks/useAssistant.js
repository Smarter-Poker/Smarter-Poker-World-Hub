/**
 * Personal Assistant Hooks
 * Provides data fetching for Strategy Hub, Virtual Sandbox, and Leak Finder
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';

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
        const userId = user?.id;

        const response = await fetch(`/api/assistant/stats?userId=${userId || ''}`);
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
      const userId = user?.id;

      let url = `/api/assistant/leaks?userId=${userId || 'demo'}`;
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }

      const response = await fetch(url);
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
  }, [fetchLeaks]);

  const updateLeakStatus = async (leakId, newStatus) => {
    try {
      const response = await fetch('/api/assistant/leaks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leakId, status: newStatus })
      });
      const data = await response.json();
      if (data.success) {
        await fetchLeaks(); // Refresh
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
      const user = getAuthUser();

      const response = await fetch('/api/assistant/sandbox/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          ...params
        })
      });

      const data = await response.json();

      if (data.success) {
        setResults({
          primaryAction: data.primaryAction,
          primaryFrequency: data.primaryFrequency,
          alternatives: data.alternatives,
          context: data.context,
          source: data.source,
          confidence: data.confidence,
          whyNot: data.whyNot,
          sessionId: data.sessionId,
        });
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

  useEffect(() => {
    async function fetchSessions() {
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
            evLoss: 0, // Would need actual EV data
            type: 'sandbox',
            date: s.created_at,
            result: s.sandbox_results?.[0]?.primary_action,
          }));
          setSessions(formatted);
        }
      } catch (err) {
        console.error('Fetch sessions error:', err);
        setSessions([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSessions();
  }, [limit]);

  return { sessions, isLoading };
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
      const user = getAuthUser();
      if (!user) {
        setError('Must be logged in to run leak detection');
        return { success: false, error: 'Not logged in' };
      }

      const response = await fetch('/api/assistant/leaks/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      const data = await response.json();

      if (data.success) {
        setDetectionResult({
          handsAnalyzed: data.handsAnalyzed,
          leaksDetected: data.leaksDetected,
          leaks: data.leaks,
        });
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
