import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * RECEIPT READER API
 *
 * Reads TEXT, not an image, and reads it with our own rules.
 *
 * WHAT CHANGED AND WHY
 * This route used to send a photograph of a player's receipt (a W-2G, often
 * enough) to a vision model and trust the JSON that came back. That was wrong
 * four ways: the same receipt could be read differently twice, the whole
 * feature died the day a model id was retired (it did, twice, in one week),
 * every scan cost money, and a tax form left the building.
 *
 * The engine now runs on the player's own device (src/lib/docscan/ocr.mjs,
 * Tesseract compiled to WebAssembly and served from our origin). The picture
 * never leaves the phone. What arrives here is a few hundred bytes of text.
 *
 * SO WHY IS THERE STILL A ROUTE
 * Two reasons, and they are the reasons it was kept rather than deleted:
 *   1. The bankroll_pro entitlement is checked HERE. Reading in the browser
 *      and skipping the server would hand the paid feature away.
 *   2. The player's saved venues live here. Matching "BELLAG10 P0KER ROOM"
 *      against the Bellagio they have played fifty times is the one thing
 *      this reader does that no general model could, and it needs the
 *      database to do it.
 *
 * The parser itself is pure and shared: src/lib/bankroll/receiptParser.mjs,
 * the same module the tests exercise without a camera or a network.
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { parseReceiptText } from '../../../src/lib/bankroll/receiptParser.mjs';

export const config = {
    api: {
        bodyParser: {
            // Text off a receipt is a few hundred bytes. The old 10mb limit
            // was for base64 images, which are no longer sent.
            sizeLimit: '256kb',
        },
    },
};

/** Longest OCR text accepted. A receipt is under 2 KB; this is generous. */
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

      // SERVER-SIDE GUARD: Verify user has Bankroll Pro access.
      //
      // Through the server gate, not checkFeatureAccess. That one is a browser
      // gate: it reads localStorage, queries with the anon client whose RLS
      // then refuses `profiles`, and recovers by fetching a RELATIVE url that
      // Node cannot resolve. Every path failed here, so this route answered
      // 403 to everyone, including a VIP account with 494,455 diamonds.
      const access = await checkServerFeatureAccess(getSupabase(), user.id, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({
              success: false,
              error: 'Premium feature access required',
              reason: access.reason,
          });
      }

      try {
          const body = req.body && typeof req.body === 'object' ? req.body : {};

          // A tab left open across the deploy still holds the old client,
          // which posts an image. Say so plainly instead of failing oddly.
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

          const knownVenues = await loadVenues(user.id);
          const data = parseReceiptText(text, { knownVenues });

          // How legible the photograph was, as the engine on the device
          // measured it. It is a different question from how sure the parser
          // is about what the document is, and the sheet shows both.
          const ocrConfidence = Number(body.ocrConfidence);
          if (Number.isFinite(ocrConfidence)) {
              data.ocr_confidence = Math.max(0, Math.min(100, Math.round(ocrConfidence)));
          }

          return res.status(200).json({ success: true, data });
      } catch (error) {
          console.warn('Receipt read error:', error);
          return res.status(500).json({
              success: false,
              error: 'Failed to read receipt',
              detail: String((error && error.message) || error).slice(0, 300),
          });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * The player's saved venues, which is what lets the reader recognise a room
 * from a bad print. A failure here is not fatal: the reader falls back to the
 * name printed on the receipt.
 */
async function loadVenues(userId) {
    try {
        const { data, error } = await getSupabase()
            .from('bankroll_locations')
            .select('id, name')
            .eq('user_id', userId)
            .limit(200);
        if (error || !Array.isArray(data)) return [];
        return data.filter((v) => v && v.name);
    } catch (_err) {
        return [];
    }
}
