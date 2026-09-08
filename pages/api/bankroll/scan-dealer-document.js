import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * DEALER DOCUMENT SCANNER API
 * OCR for gaming licenses, paystubs, and tax documents
 * Uses Grok Vision to extract structured tabular/form data
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { getGrokClient } from '../../../src/lib/grokClient';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

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

      // SERVER-SIDE GUARD: Verify user has Bankroll Pro access (protects paid Grok API)
      const access = await checkServerFeatureAccess(getSupabase(), user.id, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({ success: false, error: 'Premium feature access required' });
      }

      try {
          const { image } = req.body;

          if (!image) {
              return res.status(400).json({ success: false, error: 'No image provided' });
          }

          // Call Grok Vision API for OCR
          const extractedData = await analyzeDocument(image);

          return res.status(200).json({
              success: true,
              data: extractedData
          });
      } catch (error) {
          console.warn('Document scan error:', error);
          return res.status(500).json({ success: false, error: 'Failed to scan document' });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function analyzeDocument(imageBase64) {
    const prompt = `Analyze this employment/tax document or gaming license and extract the following information in JSON format:

{
  "category": "MUST BE EXACTLY ONE OF: gaming_license, tax, employment, paystub",
  "sub_type": "If category=tax: 'w2' | '1099' | 'tip_log' | 'other'. If category=employment: 'i9' | 'contract' | 'ein_letter' | 'other'. Else null.",
  "label": "<a short descriptive name, e.g. Nevada Gaming License 2025, or W-2 2024>",
  "state": "<2-letter state code if applicable, e.g. NV, FL>",
  "license_number": "<the exact license or registration number if present>",
  "issued_date": "<YYYY-MM-DD if present>",
  "expiry_date": "<YYYY-MM-DD if present>",
  "tax_year": <number, e.g. 2024 or 2025 if it's a tax form or paystub year>,
  "amount": <number, e.g. the gross pay on a paystub, or Box 1 on a W-2>,
  "confidence": <0-100 confidence score>
}

If any field is not visible or not relevant to the document type, use null. Be sure to look for expiration dates on licenses to populate expiry_date. For paystubs look for 'Gross Pay' or 'Net Pay'. For tax forms like W-2s, look for Box 1 Wages. Format dates as YYYY-MM-DD.`;

    // Through the shared Grok client, never a raw fetch with a model name
    // found in a file. This route posted `grok-2-vision-latest` to api.x.ai
    // directly; on 2026-09-08 that name answered "Model not found", so every
    // dealer-document scan failed after passing the gate. The client resolves
    // the model in ONE place (grok-3 reads images today), so the next model
    // change is one edit for every route instead of a production repro each.
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

    // Parse JSON from response string
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            try { reportApiError(e, null); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            console.warn('OCR Vault JSON Parse Error:', e);
            throw new Error('Failed to parse structured data from AI response.');
        }
    }

    throw new Error('Could not extract form data from image');
}
