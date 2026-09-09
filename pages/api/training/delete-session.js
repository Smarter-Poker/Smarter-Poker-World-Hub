import { withTiming } from '../../../src/utils/trainingApiUtils';

/**
 * RETIRED: verified Training sessions are sealed projections of immutable
 * attempts. Hard-deleting a projection would corrupt history, reports, and
 * leaderboard evidence while leaving its authoritative attempt behind.
 */
export default function handler(_req, res) {
  withTiming(res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    error: 'Verified Training sessions cannot be deleted individually.',
    code: 'TRAINING_SESSION_DELETE_RETIRED',
  });
}
