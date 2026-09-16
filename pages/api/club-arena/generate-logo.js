import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.
/**
 * Generate Club Logo API — Server-side proxy to xAI Grok
 * ═══════════════════════════════════════════════════════════════
 * POST /api/club-arena/generate-logo
 *
 * Keeps the xAI API key server-side only. The client sends the
 * prompt parameters, this route calls xAI and returns the result.
 *
 * Body: { clubName, style?, theme?, colorScheme? }
 * Response: { success, logoUrl?, error? }
 */

const XAI_API_KEY = (process.env.XAI_API_KEY || '').trim();
const XAI_API_URL = 'https://api.x.ai/v1/images/generations';
const TARGET_LOGO_SIZE = 340;

export default async function handler(req, res) {
  try {

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

  // Round 80: rate-limit before any external xAI call. This route incurs
  // per-call cost on the xAI API and was previously the only un-limited
  // hot endpoint in club-arena. Use the standard 'club-arena/generate-logo'
  // bucket — which falls back to per-IP if no auth is established.
  if (!applyRateLimit(req, res, 'club-arena/generate-logo')) return;

  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

    if (!XAI_API_KEY) {
        return res.status(500).json({ success: false, error: 'AI image generation not configured on server.' });
    }

    const { clubName, style = 'modern', theme, colorScheme } = req.body || {};

    if (!clubName || typeof clubName !== 'string') {
        return res.status(400).json({ success: false, error: 'clubName is required' });
    }

    // Build prompt
    let prompt = `${theme || 'poker club logo'}. `;
    prompt += `High quality, professional design. Suitable for a poker club brand. Clean, modern aesthetic. NO TEXT, NO LETTERS, NO WORDS in the image. Premium, polished look.`;
    if (colorScheme) {
        prompt += ` Color scheme: ${colorScheme}`;
    }

    try {
        const response = await fetch(XAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-imagine-image',
                prompt: prompt.trim(),
                n: 1,
                response_format: 'b64_json',
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.warn('[generate-logo] Grok API error:', errorData);
            return res.status(502).json({
                success: false,
                error: errorData.error?.message || errorData.error || `xAI API error: ${response.status}`,
            });
        }

        const data = await response.json();
        const base64Image = data.data?.[0]?.b64_json;

        if (!base64Image) {
            return res.status(502).json({ success: false, error: 'No image data received from API' });
        }

        const logoUrl = `data:image/png;base64,${base64Image}`;

        return res.status(200).json({ success: true, logoUrl });
    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[generate-logo] Failed:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
