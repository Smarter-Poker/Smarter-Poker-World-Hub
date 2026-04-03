/**
 * useSmartPractice — Hook for AI-driven training recommendations
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 17: Fetches smart practice recommendations from the analytics engine.
 * Returns the top recommendation and alternatives, auto-refreshes on mount.
 */

import { useState, useEffect, useCallback } from 'react';
import { getSessionToken } from '../lib/authUtils';

export default function useSmartPractice(gameId) {
    const [recommendation, setRecommendation] = useState(null);
    const [alternatives, setAlternatives] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchRecommendation = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = getSessionToken();
            if (!token) {
                setLoading(false);
                return;
            }

            const params = new URLSearchParams();
            if (gameId) params.set('gameId', gameId);

            const res = await fetch(`/api/training/smart-practice?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();

            if (data.success) {
                setRecommendation(data.recommendation);
                setAlternatives(data.alternatives || []);
                setAnalytics(data.analytics);
            } else {
                setError(data.error || 'Failed to load recommendations');
            }
        } catch (err) {
            console.warn('[useSmartPractice] Fetch error:', err.message);
            setError('Network error');
        }
        setLoading(false);
    }, [gameId]);

    useEffect(() => { fetchRecommendation(); }, [fetchRecommendation]);

    return {
        recommendation,
        alternatives,
        analytics,
        loading,
        error,
        refresh: fetchRecommendation,
    };
}
