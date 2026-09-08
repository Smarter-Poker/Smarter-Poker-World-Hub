/**
 * Weak-spot review is intentionally unavailable until Phase 12 derives every
 * review hand from immutable, server-graded attempts and serves it through a
 * signed practice-only receipt. The former hook downloaded answer keys and
 * trusted browser-authored review results. This inert contract keeps existing
 * callers stable without presenting fabricated or unsafe review data.
 */
import { useCallback } from 'react';

export default function useSpacedRepetition() {
  const fetchDueSpots = useCallback(async () => [], []);
  const getReviewSession = useCallback(async () => null, []);
  const markReviewed = useCallback(async () => ({
    success: false,
    code: 'TRAINING_SPACED_REPETITION_VERIFIED_ATTEMPT_REQUIRED',
  }), []);

  return {
    dueCount: 0,
    reviewSpots: [],
    loading: false,
    error: null,
    available: false,
    fetchDueSpots,
    getReviewSession,
    convertSpotsToQuestions: () => [],
    markReviewed,
  };
}
