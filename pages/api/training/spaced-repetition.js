/**
 * Legacy spaced-repetition boundary.
 *
 * Review queues must be derived from immutable server-graded attempts and
 * reissued as signed, practice-only questions. The retired implementation
 * exposed answer keys on GET and accepted browser-authored mistakes/results,
 * so every legacy method fails closed until the Phase 12 replacement lands.
 */
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
    withTiming(res);
    res.setHeader('Cache-Control', 'private, no-store');

    if (['GET', 'POST', 'PATCH'].includes(req.method)) {
      return res.status(410).json({
        success: false,
        spots: [],
        count: 0,
        error: 'Weak-spot review is paused until its queue is derived from sealed Training attempts.',
        code: 'TRAINING_SPACED_REPETITION_VERIFIED_ATTEMPT_REQUIRED',
      });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[SpacedRepetition API Error]', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
