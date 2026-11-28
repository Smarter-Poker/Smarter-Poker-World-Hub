import { OpenAI } from 'openai';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    HAND_VISION_OPENAI_MODEL,
    HAND_VISION_PROMPT,
    anthropicResponseText,
    buildAnthropicRequest,
    normalizeImagePayload,
    parseHandJson,
    selectHandVisionProvider,
} from '../../../src/lib/ai/handVision.mjs';

const ANTHROPIC_TIMEOUT_MS = 45000;

async function readWithClaude(imageBase64) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(buildAnthropicRequest(imageBase64)),
        signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`Anthropic vision request failed (${response.status})`);
    }
    return anthropicResponseText(await response.json());
}

async function readWithOpenAI(imageBase64) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
        model: HAND_VISION_OPENAI_MODEL,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: HAND_VISION_PROMPT },
                    { type: 'image_url', image_url: { url: normalizeImagePayload(imageBase64).dataUrl, detail: 'high' } },
                ],
            },
        ],
        temperature: 0,
        max_tokens: 1000,
    });
    return String(response.choices?.[0]?.message?.content || '').trim();
}

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

    const provider = selectHandVisionProvider(process.env);
    if (!provider) {
        return res.status(503).json({ success: false, error: 'AI vision is not configured' });
    }

    try {
        const { imageBase64 } = req.body || {};

        if (!imageBase64) {
            return res.status(400).json({ success: false, error: 'Missing imageBase64 payload' });
        }

        const content = provider === 'anthropic'
            ? await readWithClaude(imageBase64)
            : await readWithOpenAI(imageBase64);

        const parsedHand = parseHandJson(content);
        if (!parsedHand) {
            console.warn('[AI Vision] Failed to parse JSON response');
            return res.status(500).json({ success: false, error: 'AI failed to produce valid JSON', details: content });
        }

        return res.status(200).json({ success: true, hand: parsedHand });
    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.error('[AI Vision] Error processing hand:', err);
        return res.status(500).json({ success: false, error: 'Failed to process image' });
    }
}
