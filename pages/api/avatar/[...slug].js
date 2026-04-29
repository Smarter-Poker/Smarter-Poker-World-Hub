/**
 * /api/avatar/* — Hono catch-all router (Phase 4.4 module #13, 2026-04-29)
 *
 * Consolidates 3 AI avatar handlers under a single Hono app.
 * Same pattern as rewards/messenger/news/video/live-help/promo/employee/
 * venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/avatar):
 *   POST /generate-from-text   — Grok image gen from prompt + bg removal + upload
 *   POST /generate-from-photo  — Grok Vision analysis → image gen + bg removal + upload
 *   POST /edit-avatar          — Re-generate with character preservation + bg removal
 *
 * Replaces:
 *   edit-avatar.js          (254 LOC)
 *   generate-from-photo.js  (257 LOC)
 *   generate-from-text.js   (246 LOC)
 *   = 757 LOC, now ~370 LOC (-387 net) — the 75-LOC removeBackgroundWithSharp
 *   helper was duplicated 3x and is now shared once.
 *
 * Auth: shared userAuth via getServerUserWithFallback (Phase 4.1d ESM-clean).
 * Rate-limit: shared aiLimit (LIMITS.ai — distinct from .write because each
 * call costs Grok API + Sharp CPU + Storage upload).
 *
 * Pages Router config (applies to all routes via the catch-all):
 *   - maxDuration: 60 (Grok generation can take 30-50s)
 *   - bodyParser sizeLimit: 10mb (for base64 image uploads in generate-from-photo)
 *   - responseLimit: false (Grok responses can be large)
 *
 * No DB schema changes — uses existing custom-avatars storage bucket and
 * (optionally) custom_avatar_gallery table.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import sharp from 'sharp';
import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// ─── Pages Router config — applies to ALL routes via this catch-all ────────
export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
    responseLimit: false,
  },
  maxDuration: 60,
};

const grok = getGrokClient();

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/**
 * Multi-threshold + corner-flood-fill background removal for sticker-style
 * transparency. Identical algorithm previously duplicated 3x in source files.
 *
 * Pass 1: alpha-zero pixels with high luminance (white/near-white/light gray)
 * Pass 2: corner-color flood-fill — if a corner is light-ish, treat similar
 *         pixels (within 35-channel tolerance) as background even if they
 *         survived pass 1
 *
 * Output: PNG with transparent background, max compression (level 9).
 */
async function removeBackgroundWithSharp(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  const { width, height } = info;

  const whiteThreshold = 240;
  const nearWhiteThreshold = 225;
  const grayThreshold = 200;

  // Pass 1: alpha-zero anything that looks like background
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const isWhite = r > whiteThreshold && g > whiteThreshold && b > whiteThreshold;
    const isNearWhite = r > nearWhiteThreshold && g > nearWhiteThreshold && b > nearWhiteThreshold;
    const colorVariance = Math.max(r, g, b) - Math.min(r, g, b);
    const isGrayish = luminance > grayThreshold && colorVariance < 30;
    const isCheckerboard = (r > 200 && g > 200 && b > 200) && colorVariance < 15;
    if (isWhite || isNearWhite || isGrayish || isCheckerboard) pixels[i + 3] = 0;
  }

  // Pass 2: corner-based flood-fill for surviving background pixels
  const cornerPositions = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  for (const pos of cornerPositions) {
    if (pixels[pos + 3] !== 0) {
      const cornerR = pixels[pos], cornerG = pixels[pos + 1], cornerB = pixels[pos + 2];
      if (cornerR > 180 && cornerG > 180 && cornerB > 180) {
        const tol = 35;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (Math.abs(r - cornerR) < tol && Math.abs(g - cornerG) < tol && Math.abs(b - cornerB) < tol) {
            pixels[i + 3] = 0;
          }
        }
      }
    }
  }

  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/avatar');

const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return c.json({ success: false, error: 'Authentication required' }, 401);
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[avatar] auth err:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
};

const aiLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.ai)) {
    return c.body(null, 429);
  }
  await next();
};

app.use('*', aiLimit, userAuth);

// ─── Routes ───────────────────────────────────────────────────────────────

// POST /api/avatar/generate-from-text
app.post('/generate-from-text', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { prompt } = body;
    if (!prompt) return c.json({ success: false, error: 'Prompt is required' }, 400);

    const strictAvatarPrompt = `Create a 3D Pixar-style CHARACTER PORTRAIT ONLY.
  Subject: ${prompt}
  STRICT RULES:
  - ONLY the character's head and upper shoulders (bust portrait)
  - PURE WHITE BACKGROUND (#FFFFFF) - absolutely no gradients, textures, or shadows
  - NO poker tables, NO cards, NO chips, NO props in the background
  - NO scene, NO environment, NO accessories around character
  - Face must be the MAIN FOCUS with clear edges
  - High quality 3D render like Pixar/Disney animation
  - Vibrant colors, detailed facial features
  - Professional avatar suitable for profile picture
  - The character should embody the description given: ${prompt}
  IMPORTANT: This is for a poker player avatar - just the character portrait with a PURE WHITE background for easy removal.`;

    let response;
    try {
      response = await grok.images.generate({
        model: 'dall-e-3',
        prompt: strictAvatarPrompt,
        n: 1,
      });
    } catch (apiError) {
      console.warn('[avatar/generate-from-text] Grok API call failed:', apiError?.message);
      throw new Error(`Grok API error: ${apiError?.message}`);
    }

    if (!response?.data?.[0]?.url) {
      throw new Error('Grok API returned no image URL');
    }

    const imageUrl = response.data[0].url;
    const imgRes = await fetch(imageUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const transparent = await removeBackgroundWithSharp(buffer);

    const filename = `${userId}_${Date.now()}.png`;
    const storagePath = `generated/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('custom-avatars')
      .upload(storagePath, transparent, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[avatar/generate-from-text] upload err:', uploadError);
      throw new Error('Failed to upload avatar to storage');
    }

    const { data: { publicUrl } } = supabase.storage.from('custom-avatars').getPublicUrl(storagePath);

    return c.json({ success: true, imageUrl: publicUrl });
  } catch (err) {
    console.warn('[avatar/generate-from-text]', err);
    return c.json({ success: false, error: err?.message || 'Failed to generate avatar' }, 500);
  }
});

// POST /api/avatar/generate-from-photo
app.post('/generate-from-photo', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { photoBase64, prompt } = body;
    if (!photoBase64) return c.json({ success: false, error: 'Photo is required' }, 400);

    // Step 1: Analyze with Grok Vision
    const analysisResponse = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this person's appearance in EXTREME detail for avatar creation. Be VERY specific about:

  1. FACE SHAPE: (oval, round, square, heart, oblong, etc.)
  2. SKIN TONE: (exact shade - fair, olive, tan, brown, dark, with undertones)
  3. HAIR: Exact color, style, texture, length
  4. EYES: Exact color, shape, size
  5. EYEBROWS: Shape, thickness, color
  6. NOSE: Size, shape
  7. LIPS: Shape, fullness
  8. DISTINCTIVE FEATURES: Dimples, freckles, beauty marks
  9. OVERALL VIBE: Expression, energy
  10. AGE RANGE: Approximate age

  Be specific - this creates a Pixar-style avatar that should be RECOGNIZABLE as this person.`,
          },
          { type: 'image_url', image_url: { url: photoBase64 } },
        ],
      }],
      max_tokens: 800,
    });

    const faceDescription = analysisResponse.choices[0].message.content;

    // Step 2: Generate avatar
    const additionalStyle = prompt ? `ADDITIONAL STYLE REQUESTS: ${prompt}. ` : '';
    const dallePrompt = `Create a 3D Pixar/Disney-style cartoon PORTRAIT that MATCHES these EXACT features:

  ${faceDescription}

  ${additionalStyle}

  CRITICAL REQUIREMENTS:
  - This avatar MUST be recognizable as the person described above
  - MATCH the exact face shape, skin tone, hair color/style described
  - Head and upper shoulders only (bust portrait)
  - PURE WHITE BACKGROUND (#FFFFFF)
  - NO props, NO accessories, NO poker chips, NO cards
  - High quality 3D render with Pixar-level detail

  The goal is that if someone knows this person, they would IMMEDIATELY recognize this avatar.`;

    const imageResponse = await grok.images.generate({
      model: 'dall-e-3',
      prompt: dallePrompt,
      n: 1,
      size: '1024x1024',
    });

    if (!imageResponse?.data?.[0]?.url) {
      throw new Error('Image generation returned no URL');
    }

    const imageUrl = imageResponse.data[0].url;
    const imgRes = await fetch(imageUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const transparent = await removeBackgroundWithSharp(buffer);

    const filename = `likeness_${userId}_${Date.now()}.png`;
    const storagePath = `generated/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('custom-avatars')
      .upload(storagePath, transparent, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[avatar/generate-from-photo] upload err:', uploadError);
      throw new Error('Failed to upload avatar to storage');
    }

    const { data: { publicUrl } } = supabase.storage.from('custom-avatars').getPublicUrl(storagePath);

    return c.json({ success: true, imageUrl: publicUrl, faceDescription });
  } catch (err) {
    console.warn('[avatar/generate-from-photo]', err);
    return c.json({ success: false, error: err?.message || 'Failed to generate avatar from photo' }, 500);
  }
});

// POST /api/avatar/edit-avatar
app.post('/edit-avatar', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { imageUrl, editPrompt, originalPrompt } = body;

    if (!imageUrl) return c.json({ success: false, error: 'Image URL is required' }, 400);
    if (!editPrompt) return c.json({ success: false, error: 'Edit prompt is required' }, 400);

    const editedPrompt = `Create a 3D Pixar-style CHARACTER PORTRAIT.

  ORIGINAL CHARACTER: ${originalPrompt || 'A character'}

  MODIFICATION: ${editPrompt}

  STRICT RULES:
  - Keep the SAME character as described in "ORIGINAL CHARACTER"
  - Apply ONLY the modification described in "MODIFICATION"
  - PURE WHITE BACKGROUND (#FFFFFF)
  - Head and upper shoulders only (bust portrait)
  - High quality 3D render
  - Professional character design
  - Maintain the same art style and character identity`;

    const imageResponse = await grok.images.generate({
      model: 'dall-e-3',
      prompt: editedPrompt,
      n: 1,
    });

    if (!imageResponse?.data?.[0]?.url) {
      throw new Error('Grok API returned no image URL');
    }

    const newImageUrl = imageResponse.data[0].url;
    const imgRes = await fetch(newImageUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const transparent = await removeBackgroundWithSharp(buffer);

    const filename = `edited_${userId}_${Date.now()}.png`;
    const storagePath = `generated/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('custom-avatars')
      .upload(storagePath, transparent, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[avatar/edit-avatar] upload err:', uploadError);
      throw new Error('Failed to upload avatar to storage');
    }

    const { data: { publicUrl } } = supabase.storage.from('custom-avatars').getPublicUrl(storagePath);

    // Update most recent gallery entry if any
    try {
      const { data: existingAvatars } = await supabase
        .from('custom_avatar_gallery')
        .select('id')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingAvatars && existingAvatars.length > 0) {
        await supabase
          .from('custom_avatar_gallery')
          .update({
            image_url: publicUrl,
            prompt: `${editPrompt} (edited)`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAvatars[0].id);
      }
    } catch (galleryErr) {
      console.warn('[avatar/edit-avatar] gallery update non-fatal:', galleryErr?.message);
    }

    return c.json({ success: true, imageUrl: publicUrl, editApplied: editPrompt });
  } catch (err) {
    console.warn('[avatar/edit-avatar]', err);
    return c.json({
      success: false,
      error: err?.message || 'Failed to edit avatar',
      details: err?.response?.data || err?.toString(),
    }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[avatar] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[avatar] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
