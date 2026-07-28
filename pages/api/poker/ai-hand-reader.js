/**
 * AI Hand History Reader API
 * POST /api/poker/ai-hand-reader
 * 
 * Accepts a screenshot/photo of a poker hand and uses Grok Vision to
 * extract structured hand history data.
 */

import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// Lazy-init Supabase client (RAT-AUTH-NUCLEAR compliant)
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!key) throw new Error('[ai-hand-reader] No Supabase key');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export const config = {
    api: {
        bodyParser: { sizeLimit: '4mb' },
    },
};

const GROK_API_KEY = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || '').trim();
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

const EXTRACTION_PROMPT = `You are a poker hand history reader. Analyze this screenshot of a poker hand and extract the following data in JSON format:

{
  "game_type": "NLH" | "PLO" | "PLO5" | "Mixed",
  "stakes": "$X/$Y",
  "hero_position": "BTN" | "CO" | "HJ" | "MP" | "UTG" | "SB" | "BB",
  "hero_cards": ["Ah", "Kd"],
  "board": {
    "flop": ["Qs", "Jh", "Tc"],
    "turn": "9c",
    "river": "2d"
  },
  "pot_size": "$XXX",
  "result": "Won" | "Lost",
  "amount_won_lost": "+$XXX" | "-$XXX",
  "hand_name": "Straight",
  "num_players": 6,
  "actions": [
    { "street": "preflop", "position": "UTG", "action": "raise", "amount": "$15" },
    { "street": "preflop", "position": "HERO", "action": "call", "amount": "$15" }
  ],
  "notes": "Any additional context from the screenshot",
  "confidence_score": 95
}

RULES:
- Use standard card notation: rank + suit (Ah, Kd, Qs, Tc, 9c, 2h, etc.)
- If you can't determine a value, use null
- For stakes, use the format "$X/$Y"
- For positions, use standard abbreviations
- Output a confidence_score between 0 and 100 representing how confident you are in your OCR transcription of this poker hand.
- Return ONLY valid JSON, no markdown formatting`;

export default async function handler(req, res) {
  try {

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth
    const { user, error: authError } = await getServerUserWithFallback(req, res);
    if (authError || !user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { imageBase64, imageUrl } = req.body;

    if (!imageBase64 && !imageUrl) {
        return res.status(400).json({ error: 'Image required (imageBase64 or imageUrl)' });
    }

    if (!GROK_API_KEY) {
        return res.status(503).json({ error: 'AI service not configured' });
    }

    // ═══════════════════════════════════════════════════════════════
    // MONETIZATION: AI Hand Scanner is a VIP-only feature
    // ═══════════════════════════════════════════════════════════════
    const supabase = getSupabase();
    const { data: profile } = await supabase.from('profiles').select('diamonds, is_vip, vip_tier, vip_expires_at').eq('id', user.id).maybeSingle();
    if (!profile) return res.status(401).json({ error: 'Profile not found' });

    let isVip = false;
    if (profile?.is_vip === true) {
        if (profile.vip_tier === 'lifetime') {
            isVip = true;
        } else if (profile.vip_expires_at) {
            isVip = new Date(profile.vip_expires_at).getTime() > Date.now();
        }
    }

    if (!isVip) {
        return res.status(403).json({ error: 'VIP subscription required for AI Hand Scanner' });
    }

    try {
        // Build the vision message
        const imageContent = imageBase64
            ? { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            : { type: 'image_url', image_url: { url: imageUrl } };

        const grokResponse = await fetch(GROK_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'grok-2-vision-latest',
                messages: [
                    {
                        role: 'system',
                        content: EXTRACTION_PROMPT,
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Please analyze this poker hand screenshot and extract the hand data.' },
                            imageContent,
                        ],
                    },
                ],
                max_tokens: 2000,
                temperature: 0.1,
            }),
        });

        if (!grokResponse.ok) {
            const errText = await grokResponse.text().catch(() => 'Unknown error');
            console.warn('[AI-Hand-Reader] Grok API error:', grokResponse.status, errText);
            return res.status(502).json({ error: 'AI analysis failed' });
        }

        const grokData = await grokResponse.json();
        const rawContent = grokData.choices?.[0]?.message?.content || '';

        // Parse JSON from response
        let handData;
        try {
            // Try to extract JSON from potential markdown wrapping
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            handData = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
        } catch (parseError) {
            console.warn('[AI-Hand-Reader] Failed to parse Grok response:', rawContent);
            return res.status(422).json({
                error: 'Could not parse hand data from image',
                rawResponse: rawContent.substring(0, 500),
            });
        }

        return res.status(200).json({
            success: true,
            handData,
            source: 'grok-2-vision',
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[AI-Hand-Reader] Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
