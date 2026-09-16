/**
 * Legacy Training explanation endpoint.
 *
 * The browser used to submit both the purported correct answer and result,
 * which allowed it to author the cache entry later shown as solver truth.
 * Verified attempt-bound explanations replace this route in Phase 12.
 */

import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(410).json({
          success: false,
          error: 'Explanations require a verified server-graded Training attempt.',
          code: 'TRAINING_EXPLANATION_VERIFIED_ATTEMPT_REQUIRED',
      });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
