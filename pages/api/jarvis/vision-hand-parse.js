import { OpenAI } from 'openai';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    if (!client) {
        return res.status(503).json({ success: false, error: 'OpenAI API key not configured' });
    }

    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ success: false, error: 'Missing imageBase64 payload' });
        }

        const prompt = `
You are an expert poker analysis AI. Extract the state of the poker hand from the provided screenshot and output ONLY valid JSON matching this schema:

{
  "id": "hand_12345",
  "stakes": { "sb": 0.5, "bb": 1 },
  "players": [
    { "seat": 1, "name": "Player1", "stack": 100.0 }
  ],
  "heroName": "Hero",
  "heroCards": "Ah Kd",
  "board": ["Ts", "Jc", "2h"],
  "actions": [
    { "player": "Player1", "action": "raises", "amount": 2.5 },
    { "player": "Hero", "action": "calls", "amount": 2.5 }
  ],
  "potSize": 5.5,
  "winner": null
}

Guidelines:
1. "heroCards": Format cards as RankSuit (e.g. As, Kh, Td, 2c). Space separated string.
2. "board": Array of RankSuit strings. Leave empty or omit if preflop.
3. "actions": Detect any visible action logs in chat or visually infer. Actions must be one of: folds, checks, calls, bets, raises, all-in.
4. "heroName": Identify the player whose hole cards are visible (the user playing).
5. Output ONLY the JSON object. Do not include markdown \`\`\`json blocks.
`;

        const response = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
                                detail: 'high'
                            }
                        }
                    ]
                }
            ],
            temperature: 0,
            max_tokens: 1000,
        });

        const content = response.choices[0].message.content.trim();
        
        let parsedHand;
        try {
            // Strip any markdown wrappers if OpenAI includes them despite instructions
            const cleanedContent = content.replace(/^\\s*\`\`\`json/, '').replace(/\`\`\`\\s*$/, '').trim();
            parsedHand = JSON.parse(cleanedContent);
            
            // Ensure raw property is present for UI display
            if (!parsedHand.raw) {
                parsedHand.raw = "Parsed via AI Vision from screenshot.";
            }
            if (!parsedHand.id) {
                parsedHand.id = `hand_ai_${Date.now()}`;
            }
        } catch (parseError) {
            console.warn('[AI Vision] Failed to parse JSON response:', content);
            return res.status(500).json({ success: false, error: 'AI failed to produce valid JSON', details: content });
        }

        return res.status(200).json({ success: true, hand: parsedHand });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[AI Vision] Error processing hand:', err);
        return res.status(500).json({ success: false, error: 'Failed to process image' });
    }
}
