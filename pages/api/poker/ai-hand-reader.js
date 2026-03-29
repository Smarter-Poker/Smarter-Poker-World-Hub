/**
 * AI Hand History Reader API
 * POST /api/poker/ai-hand-reader
 * 
 * Accepts a screenshot/photo of a poker hand and uses Grok Vision to
 * extract structured hand history data.
 */

import { createClient } from '@supabase/supabase-js';

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

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
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
  "notes": "Any additional context from the screenshot"
}

RULES:
- Use standard card notation: rank + suit (Ah, Kd, Qs, Tc, 9c, 2h, etc.)
- If you can't determine a value, use null
- For stakes, use the format "$X/$Y"
- For positions, use standard abbreviations
- Return ONLY valid JSON, no markdown formatting`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const supabase = getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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
            console.error('[AI-Hand-Reader] Grok API error:', grokResponse.status, errText);
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
            console.error('[AI-Hand-Reader] Failed to parse Grok response:', rawContent);
            return res.status(422).json({
                error: 'Could not parse hand data from image',
                rawResponse: rawContent.substring(0, 500),
            });
        }

        // Optional: Save to hand_history table
        if (handData.hero_cards?.length > 0) {
            const boardCards = [];
            if (handData.board?.flop) boardCards.push(...handData.board.flop);
            if (handData.board?.turn) boardCards.push(handData.board.turn);
            if (handData.board?.river) boardCards.push(handData.board.river);

            await supabase.from('hand_history').insert({
                user_id: user.id,
                game_type: handData.game_type || 'NLH',
                stakes: handData.stakes || null,
                hero_position: handData.hero_position || null,
                hero_cards: handData.hero_cards,
                board_cards: boardCards.length > 0 ? boardCards : null,
                pot_size: parseFloat((handData.pot_size || '0').replace(/[^0-9.]/g, '')) || null,
                result: handData.result || null,
                amount: parseFloat((handData.amount_won_lost || '0').replace(/[^0-9.-]/g, '')) || 0,
                hand_name: handData.hand_name || null,
                actions: handData.actions || null,
                notes: handData.notes || 'AI-imported from screenshot',
                source: 'ai_reader',
                created_at: new Date().toISOString(),
            }).catch(err => {
                console.warn('[AI-Hand-Reader] Failed to save hand (non-critical):', err.message);
            });
        }

        return res.status(200).json({
            success: true,
            handData,
            source: 'grok-2-vision',
        });
    } catch (err) {
        console.error('[AI-Hand-Reader] Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
