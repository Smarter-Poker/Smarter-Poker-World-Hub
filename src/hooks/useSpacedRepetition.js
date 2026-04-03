/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 15: useSpacedRepetition — Cross-Session Mistake Review Hook
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides:
 * - fetchDueSpots() → retrieves spots due for review from spaced repetition API
 * - startReviewSession() → injects review spots into useGTOTrainer preloaded queue
 * - markReviewed(spotSignature, wasCorrect) → updates SM-2 interval
 * - dueCount → number of spots currently due for review
 * - reviewSpots → the actual spots ready to review
 *
 * Usage in GodModeArena or training lobby:
 *   const { dueCount, startReviewSession } = useSpacedRepetition(gameId);
 *   // Show "Review X Weak Spots" button when dueCount > 0
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getSessionToken } from '../lib/authUtils';

export default function useSpacedRepetition(gameId = null) {
    const [dueCount, setDueCount] = useState(0);
    const [reviewSpots, setReviewSpots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const hasFetched = useRef(false);

    /**
     * Fetch spots due for review from the spaced repetition API
     */
    const fetchDueSpots = useCallback(async (count = 25) => {
        setLoading(true);
        setError(null);

        try {
            const token = getSessionToken();
            if (!token) {
                setLoading(false);
                return [];
            }

            const params = new URLSearchParams({ count: count.toString() });
            if (gameId) params.set('gameId', gameId);

            const response = await fetch(`/api/training/spaced-repetition?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                console.warn('[SpacedRepetition] Fetch failed:', response.status);
                setLoading(false);
                return [];
            }

            const data = await response.json();
            const spots = data.spots || [];

            setReviewSpots(spots);
            setDueCount(spots.length);
            setLoading(false);

            console.log(`[SpacedRepetition] ${spots.length} spots due for review`);
            return spots;
        } catch (err) {
            console.warn('[SpacedRepetition] Fetch error:', err.message);
            setError(err.message);
            setLoading(false);
            return [];
        }
    }, [gameId]);

    /**
     * Convert spaced repetition spots into training questions
     * Returns an array compatible with useGTOTrainer's preloaded queue
     */
    const convertSpotsToQuestions = useCallback((spots) => {
        return spots.map((spot, idx) => ({
            id: `review_${spot.spot_signature}_${idx}`,
            type: 'PIO',
            source: 'SPACED_REPETITION',
            question: `Review: ${spot.hero_position || 'Hero'} vs ${spot.villain_position || 'Villain'} on ${spot.street || 'flop'} — ${spot.spot_type || 'general'} spot`,
            scenario: {
                heroPosition: spot.hero_position || 'BTN',
                villainPosition: spot.villain_position || 'BB',
                street: spot.street || 'flop',
                board: spot.board || '',
                heroHand: spot.hero_hand || '',
                pot: 12,
                heroStack: 100,
                villainStack: 100,
                context: `Reviewing a ${spot.spot_type || 'general'} spot you previously missed. Classification: ${spot.classification || 'WRONG'}. EV loss: ${(spot.ev_loss || 0).toFixed(2)} BB.`,
                isReview: true,
            },
            heroCards: spot.hero_hand ? [spot.hero_hand.substring(0, 2), spot.hero_hand.substring(2, 4)] : ['As', 'Ks'],
            boardCards: spot.board ? spot.board.split(' ').filter(Boolean) : [],
            correctAnswer: spot.correct_action || 'unknown',
            correctAnswerText: spot.correct_action || 'Unknown',
            explanation: `This spot was previously classified as ${spot.classification || 'a mistake'}. The solver recommends: ${spot.correct_action || 'unknown'}.`,
            gtoFrequencies: {},
            _spacedRepetition: {
                spotSignature: spot.spot_signature,
                reviewCount: spot.review_count || 0,
                evLoss: spot.ev_loss || 0,
            },
        }));
    }, []);

    /**
     * Mark a spot as reviewed (correct or wrong)
     * Updates the SM-2 interval via the API
     */
    const markReviewed = useCallback(async (spotSignature, wasCorrect) => {
        try {
            const token = getSessionToken();
            if (!token) return;

            await fetch('/api/training/spaced-repetition', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ spotSignature, wasCorrect }),
            });

            console.log(`[SpacedRepetition] Marked ${spotSignature.slice(0, 20)}... as ${wasCorrect ? 'correct' : 'wrong'}`);
        } catch (err) {
            console.warn('[SpacedRepetition] Mark reviewed error:', err.message);
        }
    }, []);

    /**
     * Get the review questions ready for injection into a training session
     * Returns { questions, count } or null if no spots due
     */
    const getReviewSession = useCallback(async () => {
        const spots = await fetchDueSpots(25);
        if (!spots || spots.length === 0) return null;

        const questions = convertSpotsToQuestions(spots);
        return { questions, count: questions.length, spots };
    }, [fetchDueSpots, convertSpotsToQuestions]);

    // Auto-fetch on mount (only once)
    useEffect(() => {
        if (!hasFetched.current) {
            hasFetched.current = true;
            fetchDueSpots(25);
        }
    }, [fetchDueSpots]);

    return {
        dueCount,
        reviewSpots,
        loading,
        error,
        fetchDueSpots,
        getReviewSession,
        convertSpotsToQuestions,
        markReviewed,
    };
}
