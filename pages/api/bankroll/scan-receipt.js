import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * RECEIPT SCANNER API
 * OCR for tournament receipts + travel expenses  
 * Uses Grok Vision to extract structured data
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { getGrokClient } from '../../../src/lib/grokClient';


// Expense categories for classification
const EXPENSE_CATEGORIES = [
    'buy_in',      // Tournament/cash game buy-ins
    'hotel',       // Lodging
    'flights',     // Air travel
    'rental_car',  // Vehicle rentals
    'gas',         // Fuel
    'meals',       // Food & drink
    'transport',   // Uber, taxi, parking
    'tips',        // Dealer tips, valet
    'tournament',  // Tournament-specific fees
    'other'        // Miscellaneous
];

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.ai)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
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
          const { image } = req.body;

          if (!image) {
              return res.status(400).json({ success: false, error: 'No image provided' });
          }

          // Call Grok Vision API for OCR
          const extractedData = await analyzeReceipt(image);

          return res.status(200).json({
              success: true,
              data: extractedData
          });
      } catch (error) {
          console.warn('Receipt scan error:', error);
          // `detail` is the difference between "it broke" and "the model name
          // is wrong". It is the failure reason, not user data.
          return res.status(500).json({
              success: false,
              error: 'Failed to scan receipt',
              detail: String((error && error.message) || error).slice(0, 300),
          });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function analyzeReceipt(imageBase64) {
    const GROK_API_KEY = (process.env.XAI_API_KEY || process.env.GROK_API_KEY || '').trim();

    if (!GROK_API_KEY) {
        throw new Error('Receipt scanning is not configured. Missing API key.');
    }

    const prompt = `You are reading a photograph a poker player took of a piece of paper.
First decide WHAT KIND of document it is, then extract only the fields that
belong to that kind. Reply with JSON and nothing else.

document_type must be exactly one of:
  "tournament_buyin"  a tournament entry receipt. Look for an event name, a
                      buy-in plus a separate fee (e.g. "$300 + $40"), entry or
                      seat numbers, a start time, "re-entry", flight letters.
  "cash_game_buyin"   a cash game buy-in or chip purchase. Look for stakes
                      ("1/2", "2/5"), "table", "seat", "chips", "buy in".
  "payout"            a cash-out, payout or prize slip. Look for "cash out",
                      "payout", "prize", a finishing position, "redeem".
  "w2g"               a W-2G or similar gambling tax form. Look for "W-2G",
                      "Certain Gambling Winnings", a payer TIN, box numbers,
                      "federal income tax withheld".
  "expense"           an ordinary purchase: meal, hotel, fuel, ride, flight.
  "paystub"           a dealer paystub or earnings statement, with tokes/tips.
  "unknown"           you genuinely cannot tell.

Return this shape. Use null for anything not visible. Never invent a number:
if you cannot read an amount, it is null.

{
  "document_type": "<one of the above>",
  "confidence": <0-100, how sure you are of document_type>,
  "vendor": "<casino, business or payer name>",
  "location": "<city, state if visible>",
  "date": "<YYYY-MM-DD>",
  "amount": <total on the document>,
  "currency": "USD or EUR",
  "description": "<one short line describing it>",

  "tournament_name": "<tournament_buyin only>",
  "buy_in": <tournament_buyin: the prize-pool portion>,
  "fee": <tournament_buyin: the house fee, if shown separately>,
  "game_type": "<nlhe, plo, mixed etc if stated>",

  "stakes": "<cash_game_buyin only, e.g. 1/2>",

  "payout": <payout only: amount paid out>,
  "finish_position": <payout only, if shown>,

  "gross_winnings": <w2g only>,
  "federal_withheld": <w2g only>,
  "state_withheld": <w2g only>,
  "tax_year": <w2g only, 4 digits>,
  "form_type": "<w2g only, e.g. W-2G>",

  "category": "<expense only: hotel, flights, rental_car, gas, meals, transport, tips, tournament, other>"
}

A buy-in receipt is NOT an expense: classify it as tournament_buyin or
cash_game_buyin so it is recorded against the session rather than as a cost.`;

    // Through the shared Grok client, not a raw fetch with a hardcoded model.
    //
    // This route sent `grok-2-vision-latest` (rejected), then
    // `grok-2-vision-1212` copied from a route that works. That one is ALSO
    // rejected: the working route goes through this client, whose MODEL_MAP
    // has no vision entry, so an unknown name falls through to grok-3, and
    // grok-3 is what actually reads the image. Going through the client means
    // the next model change is one edit in MODEL_MAP for every route at once,
    // instead of another production repro per route.
    const grok = getGrokClient();
    const completion = await grok.chat.completions.create({
        model: 'grok-3',
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: imageBase64.startsWith('data:')
                                ? imageBase64
                                : `data:image/jpeg;base64,${imageBase64}`,
                        },
                    },
                    { type: 'text', text: prompt },
                ],
            },
        ],
        temperature: 0.1,
    });

    const content = completion?.choices?.[0]?.message?.content;

    // Parse JSON from response
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            try { reportApiError(e, null); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            console.warn('OCR Receipt JSON Parse Error:', e);
            throw new Error('Failed to parse structured data from AI response.');
        }
    }

    throw new Error('Could not extract receipt data from image');
}
