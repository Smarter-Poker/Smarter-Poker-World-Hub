/**
 * Personal Assistant Hooks
 * Provides data fetching for Strategy Hub, Virtual Sandbox, and Leak Finder
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
        const { data: { user } } = await supabase.auth.getUser();
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
      const { data: { user } } = await supabase.auth.getUser();
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

      const { data: { user } } = await supabase.auth.getUser();

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
        const { data: { user } } = await supabase.auth.getUser();
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
