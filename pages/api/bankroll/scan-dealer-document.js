import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * DEALER DOCUMENT READER API
 *
 * Reads TEXT, not an image, and reads it with our own rules.
 *
 * The documents a dealer puts in the vault are a gaming card, a W-2, an I-9
 * and a paystub: government paper that says the same words in the same boxes
 * every year. That is the easiest thing in the world for a rule and a waste
 * of a vision model, which until 2026-09-09 is what read them, at a cost per
 * scan, over the network, from a photograph of somebody's licence.
 *
 * The engine now runs on the dealer's own device (src/lib/docscan/ocr.mjs).
 * The picture stays on the phone. This route keeps the bankroll_pro gate and
 * runs the shared pure parser, src/lib/bankroll/dealerDocParser.mjs.
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { parseDealerDocumentText } from '../../../src/lib/bankroll/dealerDocParser.mjs';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '256kb',
        },
    },
};

const MAX_TEXT = 20000;

/**
 * The reader's own limit, not the one written for a paid AI call.
 *
 * LIMITS.ai is 5 a minute, and it was right when every scan was a billed
 * request to a vision model. This route now runs a pure text parse (measured
 * at 8 ms on a real receipt, 23 ms on 20 KB of adversarial input) and one
 * small read of the player's saved venues. Nothing here costs money.
 *
 * What the old limit cost instead: a player emptying a pocket after a session
 * scans eight receipts, and numbers six, seven and eight are refused. They
 * fall through to the manual choice looking like receipts that could not be
 * read - while "File All Suggested" on the dashboard actively encourages
 * exactly that burst.
 */
const READER_LIMIT = { max: 30, windowMs: 60_000, scope: ':bankroll-reader' };

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, READER_LIMIT)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
      const user = authUser;
      if (authErr || !user) {
          return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      // SERVER-SIDE GUARD: Bankroll Pro, through the server gate. The browser
      // gate returns hasAccess:false inside an API route, which is why this
      // answered 403 to every user, VIP included, until 2026-09-08.
      const access = await checkServerFeatureAccess(getSupabase(), user.id, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({ success: false, error: 'Premium feature access required' });
      }

      try {
          const body = req.body && typeof req.body === 'object' ? req.body : {};

          if (body.image && !body.text) {
              return res.status(400).json({
                  success: false,
                  error: 'This page is out of date. Reload and scan again.',
                  code: 'stale_client',
              });
          }

          const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
          if (!text.trim()) {
              return res.status(400).json({ success: false, error: 'No text provided' });
          }

          const data = parseDealerDocumentText(text);

          const ocrConfidence = Number(body.ocrConfidence);
          if (Number.isFinite(ocrConfidence)) {
              data.ocr_confidence = Math.max(0, Math.min(100, Math.round(ocrConfidence)));
          }

          return res.status(200).json({ success: true, data });
      } catch (error) {
          console.warn('Document read error:', error);
          return res.status(500).json({
              success: false,
              error: 'Failed to read document',
              detail: String((error && error.message) || error).slice(0, 300),
          });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
