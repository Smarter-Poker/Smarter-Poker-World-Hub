import { timingSafeEqual } from 'crypto';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.
/**
 * /api/poker/gen-lobby-bg
 * Generates a cinematic lobby background image via Grok API.
 * Returns base64 JPEG or URL to the generated image.
 *
 * GET /api/poker/gen-lobby-bg?key=<LOBBY_IMAGE_GEN_KEY>&style=default
 *
 * AUTH, corrected 2026-09-02 — same note as gen-lobby-img.js. A hard-coded
 * password was committed in the code AND repeated in this doc comment, with
 * no rate limit, in front of a billed image generation call.
 * The secret now lives in `LOBBY_IMAGE_GEN_KEY`, is compared in constant time,
 * and the route fails CLOSED when it is unset.
 */

/** Constant-time compare. Length is checked first because timingSafeEqual
 *  throws on a length mismatch rather than returning false. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  // Billed per call, so the AI limit (5/min) rather than the read limit.
  if (!applyRateLimit(req, res, LIMITS.ai)) return;

  const expected = process.env.LOBBY_IMAGE_GEN_KEY;
  if (!expected) {
    return res
      .status(503)
      .json({ error: 'Image generation is not configured (LOBBY_IMAGE_GEN_KEY unset).' });
  }
  if (!req.query.key || !safeEqual(req.query.key, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { style = 'default' } = req.query;

  const STYLE_PROMPTS = {
    default: `Cinematic ultra-wide 16:9 dark futuristic poker command center background. Deep navy blue and black space-themed atmosphere with subtle holographic grid lines, floating particles of light, and a central circular holographic radar platform with concentric cyan energy rings. Nebula-like purple and blue haze in corners. Stars scattered across the dark void. Volumetric cyan and blue god rays from center. Completely dark edges fading to pure black. No text, no people, no cards - just the atmospheric background. Ultra-high detail, 4K cinematic quality, sci-fi HUD aesthetic.`,
    neon: `Cinematic ultra-wide 16:9 cyberpunk neon poker lounge background. Deep purple and magenta atmosphere with neon grid floor stretching to horizon, holographic data streams, floating geometric shapes. Neon pink and cyan accent lighting. Moody atmospheric fog. No text, no people - pure atmospheric background. 4K cinematic quality.`,
    gold: `Cinematic ultra-wide 16:9 luxury high-stakes poker room background. Rich deep black with golden accent lighting, ornate Art Deco geometric patterns as subtle overlay, warm amber volumetric light from above, floating golden dust particles. Elegant and prestigious atmosphere. No text, no people - pure atmospheric background. 4K cinematic quality.`,
  };

  const prompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.default;

  try {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: (process.env.XAI_API_KEY || '').trim(),
      baseURL: 'https://api.x.ai/v1',
    });

    const response = await client.images.generate({
      model: 'grok-imagine-image',
      prompt,
      n: 1,
      response_format: 'b64_json',
    });

    if (!response?.data?.[0]?.b64_json) {
      return res.status(502).json({ error: 'Image generation returned no data' });
    }
    const b64 = response.data[0].b64_json;

    return res.status(200).json({
      success: true,
      style,
      b64,
      size: b64.length,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn(`[gen-lobby-bg] Error:`, err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { maxDuration: 120 };
