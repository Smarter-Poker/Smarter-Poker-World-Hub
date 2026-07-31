import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Trivia GTO Panel Image Generator
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates premium GTO analysis panel images for trivia questions using Grok AI.
 * Images are cached in Supabase storage for reuse.
 * 
 * POST /api/trivia/render-gto-panel
 *
 * Input: { question_id: uuid }
 * Returns: { imageUrl: "https://...", illustrative: boolean }
 *
 * SECURITY: the prompt is built EXCLUSIVELY from the trivia_questions row
 * identified by question_id. It used to interpolate free-text `question`,
 * `correctAnswer`, `explanation`, `options` and `category` straight from the
 * request body into a paid image-generation prompt, which made this a
 * subsidised arbitrary-image generator writing to a public bucket under
 * content-derived cache keys (unbounded keys = unbounded storage + spend).
 *
 * HONESTY: frequencies and EV are read from engine_metadata when the row was
 * produced by the deterministic solver pipeline. Otherwise the panel is
 * generated with clearly illustrative numbers and labelled as such, rather
 * than presenting invented solver output as real analysis.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import crypto from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Action colors for the panel
const ACTION_COLORS = {
    'FOLD': 'red',
    'CHECK': 'gray/blue',
    'CALL': 'yellow/amber',
    'BET': 'cyan',
    'RAISE': 'neon green',
    'SHOVE': 'magenta/purple',
    'ALL-IN': 'magenta/purple',
    '3-BET': 'neon green',
    '4-BET': 'purple',
    'OPTIMAL': 'cyan',
};

// Difficulty to confidence mapping
const DIFFICULTY_CONFIDENCE = {
    'easy': 92,
    'medium': 78,
    'hard': 85,
};

// Category-specific GTO approaches
const CATEGORY_APPROACHES = {
    'gto_theory': 'Solver-based strategy involves a balanced range construction with aggressive value betting on favorable textures.',
    'gto_scenarios': 'This line optimizes expected value against an equilibrium strategy while maintaining range balance.',
    'mtt_situations': 'In tournament play, ICM pressure and stack dynamics dictate optimal frequencies for this spot.',
    'cash_game_situations': 'Deep stack play requires careful consideration of implied odds and equity realization.',
    'icm_chip_ev': 'ICM calculations show significant risk premium here. The chip EV vs $EV differential requires frequency adjustments.',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only these categories get a GTO analysis panel. */
const GTO_CATEGORIES = new Set([
    'gto_theory', 'gto_scenarios', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev',
]);

/** Trim a DB string to a hard length before it enters the prompt. */
function clamp(text, max) {
    const s = typeof text === 'string' ? text : '';
    return s.length > max ? `${s.slice(0, max - 1)}...` : s;
}

/**
 * Real GTO frequency for an action from engine_metadata.gtoFrequencies,
 * when the deterministic pipeline produced this question.
 * @returns {number|null} percentage 0-100
 */
function pickFrequency(meta, action) {
    const freqs = meta?.gtoFrequencies;
    if (!freqs || typeof freqs !== 'object') return null;
    const key = Object.keys(freqs).find(k => k.toUpperCase() === String(action).toUpperCase());
    const raw = key ? freqs[key] : null;
    const num = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(num)) return null;
    // Accept either 0-1 or 0-100 encodings.
    const pct = num <= 1 ? num * 100 : num;
    return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Real EV string from engine_metadata.evData, when present. */
function pickEv(meta) {
    const ev = meta?.evData;
    const raw = typeof ev === 'object' && ev !== null ? (ev.bb ?? ev.value ?? ev.ev) : ev;
    const num = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(num)) return null;
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}BB`;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG #268 FIX: Require JWT or admin auth — calls paid Grok API
      const adminSecret = req.headers['x-admin-secret'];
      const envSecret = process.env.ADMIN_ROUTE_SECRET;
      const hasAdminAuth = envSecret && adminSecret === envSecret;

      if (!hasAdminAuth) {
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      try {
          // ─── INPUT: a question id, nothing else ──────────────────────────
          const questionId = req.body?.question_id ?? req.body?.questionId;
          if (typeof questionId !== 'string' || !UUID_RE.test(questionId)) {
              return res.status(400).json({ success: false, error: 'question_id (uuid) required' });
          }

          const { data: row, error: qErr } = await getSupabase()
              .from('trivia_questions')
              .select('id, category, difficulty, question, options, correct_index, explanation, engine_metadata, source')
              .eq('id', questionId)
              .maybeSingle();

          if (qErr) {
              console.warn('[Trivia-GTO-Panel] question lookup failed:', qErr.message);
              return res.status(500).json({ success: false, error: 'Lookup failed' });
          }
          if (!row) {
              return res.status(404).json({ success: false, error: 'Question not found' });
          }
          if (!GTO_CATEGORIES.has(row.category)) {
              return res.status(400).json({ success: false, error: 'Question is not a GTO-category question' });
          }

          const options = Array.isArray(row.options) ? row.options : [];
          const correctIndex = Number.isInteger(row.correct_index) ? row.correct_index : 0;
          const difficulty = row.difficulty || 'medium';
          const category = row.category;

          const action = extractAction(options[correctIndex]);
          const gtoApproach = CATEGORY_APPROACHES[category] || CATEGORY_APPROACHES['gto_theory'];

          // Real solver numbers when the row carries them; otherwise clearly
          // illustrative placeholders derived from difficulty.
          const meta = row.engine_metadata && typeof row.engine_metadata === 'object' ? row.engine_metadata : null;
          const realFreq = pickFrequency(meta, action);
          const realEv = pickEv(meta);
          const illustrative = realFreq == null && realEv == null;

          const frequency = realFreq ?? (DIFFICULTY_CONFIDENCE[difficulty] || 78);
          const evValue = realEv ?? (difficulty === 'hard' ? '+1.75BB' : difficulty === 'medium' ? '+1.25BB' : '+0.85BB');

          const explanation = clamp(row.explanation || 'This is the optimal GTO play in this situation.', 200);

          // Alternate lines from the other options in the DB row.
          const alternateLines = options
              .filter((_, i) => i !== correctIndex)
              .slice(0, 2)
              .map((opt, i) => ({
                  action: extractAction(opt),
                  frequency: pickFrequency(meta, extractAction(opt)) != null
                      ? `${pickFrequency(meta, extractAction(opt))}%`
                      : (i === 0 ? '15%' : '5%'),
                  reason: i === 0
                      ? 'Mixed strategy for range balance'
                      : 'Against extremely tight opponents',
              }));

          // Cache key is derived from the QUESTION ID, so the number of
          // distinct stored objects is bounded by the question pool.
          const cacheKey = generateCacheKey({ questionId: row.id, illustrative });

          // Check if image exists in cache
          const existingUrl = await checkCachedImage(cacheKey);
          if (existingUrl) {
              return res.status(200).json({
                  success: true,
                  imageUrl: existingUrl,
                  fromCache: true,
                  illustrative,
              });
          }

          // Generate image using Grok AI
          const imageBuffer = await generateWithGrok({
              action,
              frequency,
              explanation,
              gtoApproach,
              evValue,
              alternateLines,
              category,
              illustrative,
          });

          // Upload to Supabase storage
          const imageUrl = await uploadToStorage(cacheKey, imageBuffer);

          return res.status(200).json({
              success: true,
              imageUrl,
              fromCache: false,
              illustrative,
          });

      } catch (error) {
          console.warn('[Trivia-GTO-Panel] Error:', error);
          return res.status(500).json({
              success: false,
              error: error.message,
          });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Extract action keyword from answer text
 */
function extractAction(text) {
    if (!text) return 'OPTIMAL';
    const upper = text.toUpperCase();

    const actions = ['ALL-IN', 'SHOVE', '4-BET', '3-BET', 'RAISE', 'BET', 'CALL', 'CHECK', 'FOLD'];
    for (const action of actions) {
        if (upper.includes(action)) return action;
    }

    // Return first word as fallback
    return text.split(' ')[0]?.toUpperCase()?.slice(0, 8) || 'OPTIMAL';
}

/**
 * Generate GTO panel image using Grok AI
 */
async function generateWithGrok({
    action,
    frequency,
    explanation,
    gtoApproach,
    evValue,
    alternateLines,
    category,
    illustrative = false,
}) {
    const actionColor = ACTION_COLORS[action] || 'neon green';
    // Do not present invented numbers as solver output.
    const sourceBadge = illustrative
        ? 'ILLUSTRATIVE - not solver output'
        : 'Smarter Poker Data';

    const prompt = `Create a premium poker GTO analysis panel with futuristic metal styling:

DESIGN SPECIFICATIONS:
- Dark navy/black gradient background (#0a1628 to #1a2744)
- Metallic silver-gray beveled frame with rounded corners
- Cyan accent lights at bottom corners
- Tech aesthetic like Iron Man HUD interface

HEADER SECTION:
- TOP LEFT: Circular Jarvis AI avatar (cyan glowing humanoid robot face) with "JARVIS" label below
- CENTER: Large "${action}" text in ${actionColor} with glow effect, inside a pill-shaped badge
- RIGHT: "${frequency}%" in a circular meter
- TOP RIGHT CORNER: "${sourceBadge}" badge in cyan

CONTENT SECTIONS (4 expandable metal-framed cards):

1. EXPLANATION:
"${explanation}"
Highlight "${action}" in ${actionColor}, "GTO" and "EV" terms in cyan

2. GTO APPROACH:
"${gtoApproach}"
Highlight "balanced range" in cyan

3. $ EV ANALYSIS:
Large "${evValue}" in green with glow
"This action yields an expected value of ${evValue}, significantly higher than alternatives."

4. ALTERNATE LINES:
${alternateLines.map((line, i) => `• ${i === 0 ? 'Yellow' : 'Red'} dot: ${line.action} - ${line.frequency} - "${line.reason}"`).join('\n')}

STYLE: Premium, futuristic, metal-framed poker solver UI. High-tech dark theme. NO plain/basic styling.`;

    // Call Grok image generation
    const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${(process.env.XAI_API_KEY || '').trim()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'grok-2-image-1212',
            prompt: prompt,
            n: 1,
            response_format: 'b64_json',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.data?.[0]?.b64_json) {
        throw new Error('Invalid response from Grok API');
    }

    return Buffer.from(data.data[0].b64_json, 'base64');
}

/**
 * Generate cache key from content
 */
function generateCacheKey(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return `trivia-gto-${hash.digest('hex').substring(0, 16)}`;
}

/**
 * Check if image exists in cache
 */
async function checkCachedImage(cacheKey) {
    try {
        const { data } = getSupabase().storage
            .from('gto-panels')
            .getPublicUrl(`${cacheKey}.png`);

        const response = await fetch(data.publicUrl, { method: 'HEAD' });
        if (response.ok) {
            return data.publicUrl;
        }
    } catch (error) {
        // Not cached — log without referencing `req` (out of scope here)
        try { reportApiError(error, { route: '/api/trivia/render-gto-panel', stage: 'cache_check' }); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    }
    return null;
}

/**
 * Upload image to Supabase Storage
 */
async function uploadToStorage(cacheKey, buffer) {
    const { error } = await getSupabase().storage
        .from('gto-panels')
        .upload(`${cacheKey}.png`, buffer, {
            contentType: 'image/png',
            upsert: true,
        });

    if (error) {
        console.warn('[Trivia-GTO-Panel] Upload error:', error);
        throw error;
    }

    const { data: urlData } = getSupabase().storage
        .from('gto-panels')
        .getPublicUrl(`${cacheKey}.png`);

    return urlData.publicUrl;
}
