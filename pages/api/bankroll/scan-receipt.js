import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * RECEIPT SCANNER API
 * OCR for tournament receipts + travel expenses  
 * Uses Grok Vision to extract structured data
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkFeatureAccess } from '../../../src/lib/gates/premiumFeatureGate';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

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

      // SERVER-SIDE GUARD: Verify user has Bankroll Pro access
      const access = await checkFeatureAccess(user.id, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({ success: false, error: 'Premium feature access required' });
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
          return res.status(500).json({ success: false, error: 'Failed to scan receipt' });
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

    const prompt = `Analyze this receipt image and extract the following information in JSON format:

{
  "category": "one of: buy_in, hotel, flights, rental_car, gas, meals, transport, tips, tournament, other",
  "amount": <number - total amount paid>,
  "currency": "USD or EUR",
  "vendor": "<business name>",
  "location": "<city, state if visible>",
  "date": "<YYYY-MM-DD format if visible>",
  "description": "<brief description of what was purchased>",
  "tax_deductible": <boolean - true if likely poker-related business expense>,
  "itemized": [
    {"item": "<item name>", "amount": <number>}
  ],
  "confidence": <0-100 confidence score>
}

If any field is not visible, use null. For poker buy-ins, look for "buy-in", "entry fee", "tournament", "cash", "chips". For hotels look for room rates, nights stayed. For meals look for food items, tips, total.`;

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROK_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'grok-2-vision-latest',
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
                        {
                            type: 'text',
                            text: prompt,
                        },
                    ],
                },
            ],
            temperature: 0.1,
        }),
    });

    if (!response.ok) {
        throw new Error(`OCR API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    // Parse JSON from response
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            console.warn('OCR Receipt JSON Parse Error:', e);
            throw new Error('Failed to parse structured data from AI response.');
        }
    }

    throw new Error('Could not extract receipt data from image');
}
