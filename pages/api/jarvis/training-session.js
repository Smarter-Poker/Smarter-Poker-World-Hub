/**
 * Legacy Training-to-Jarvis ingestion endpoint.
 *
 * Browser-authored scores, answers, leak classifications, and timestamps are
 * not an authoritative Training record. Phase 12 will derive coaching data
 * from immutable, server-graded attempts instead.
 */

import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(410).json({
          success: false,
          error: 'Jarvis coaching ingestion requires a verified server-graded Training attempt.',
          code: 'JARVIS_TRAINING_VERIFIED_ATTEMPT_REQUIRED',
      });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
