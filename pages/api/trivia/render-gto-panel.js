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
 * Returns: { imageUrl: "https://...", illustrative: false, solverSource }
 *
 * SECURITY: the prompt is built EXCLUSIVELY from the immutable question
 * revision bound to the authenticated session. It used to interpolate
 * free-text request fields into a paid image-generation prompt, which made
 * this a subsidised arbitrary-image generator writing to a public bucket
 * under content-derived cache keys (unbounded keys = unbounded storage +
 * spend). The review RPC also refuses pre-answer access and durable voids.
 *
 * HONESTY: frequencies and EV are projected from server metadata only after
 * the answer is irreversibly bound. When that evidence is absent, the route
 * fails closed; it never invents a confidence, EV, range or alternate line.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import crypto from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { renderGtoPanelSingleflight } from '../../../src/lib/trivia/gtoRenderSingleflight.mjs';
import { sanitizeSolverAnalysis } from '../../../src/lib/trivia/strategyContextPolicy.mjs';
import { v3ErrorStatus } from '../../../src/lib/trivia/phase3Engine.mjs';
import {
    canRenderStrategyVisualCard,
    isStrategyVisualCardCategory,
    isStrategyVisualCardMode,
} from '../../../src/lib/trivia/strategyVisualCardPolicy.mjs';

export const config = { maxDuration: 120 };

// The lease outlives the function's configured maximum duration. A killed
// invocation therefore cannot still be purchasing a render when the claim is
// eligible to be stolen by another application instance.
const RENDER_CLAIM_LEASE_SECONDS = 180;

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
    'FOLD': 'warning red',
    'CHECK': 'cold chrome',
    'CALL': 'electric table blue',
    'BET': 'restrained prize gold',
    'RAISE': 'restrained prize gold',
    'SHOVE': 'restrained prize gold',
    'ALL-IN': 'restrained prize gold',
    '3-BET': 'restrained prize gold',
    '4-BET': 'restrained prize gold',
    'OPTIMAL': 'electric table blue',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trim a DB string to a hard length before it enters the prompt. */
function clamp(text, max) {
    const s = typeof text === 'string' ? text : '';
    return s.length > max ? `${s.slice(0, max - 1)}...` : s;
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
      let authenticatedUserId = null;

      if (!hasAdminAuth) {
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
          authenticatedUserId = user.id;
      }

      try {
          // ─── INPUT: a question id, nothing else ──────────────────────────
          const questionId = req.body?.question_id ?? req.body?.questionId;
          if (typeof questionId !== 'string' || !UUID_RE.test(questionId)) {
              return res.status(400).json({ success: false, error: 'question_id (uuid) required' });
          }

          // A panel reveals the solver-preferred play. Every caller, including
          // an operator, supplies a real session so the render is tied to the
          // exact revision the player saw rather than today's mutable row.
          const sessionId = req.body?.session_id ?? req.body?.sessionId;
          if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
              return res.status(400).json({ success: false, error: 'session_id_required' });
          }

          let reviewUserId = authenticatedUserId;
          if (hasAdminAuth) {
              const { data: ownedSession, error: ownerErr } = await getSupabase()
                  .from('trivia_sessions')
                  .select('user_id')
                  .eq('id', sessionId)
                  .maybeSingle();
              if (ownerErr) {
                  console.warn('[Trivia-GTO-Panel] session owner lookup failed:', ownerErr.message || ownerErr);
                  return res.status(500).json({ success: false, error: 'session_lookup_failed' });
              }
              if (!ownedSession?.user_id) {
                  return res.status(404).json({ success: false, error: 'session_not_found' });
              }
              reviewUserId = ownedSession.user_id;
          }

          const { data: review, error: reviewErr } = await getSupabase().rpc(
              'trivia_session_question_review_v1',
              {
                  p_session_id: sessionId,
                  p_user_id: reviewUserId,
                  p_question_id: questionId,
              },
          );
          if (reviewErr) {
              console.warn('[Trivia-GTO-Panel] bound revision review failed:', reviewErr.message || reviewErr);
              return res.status(500).json({ success: false, error: 'question_review_failed' });
          }
          if (!review?.success) {
              const reviewError = review?.error || 'question_review_failed';
              return res.status(v3ErrorStatus(reviewError)).json({ success: false, error: reviewError });
          }
          // This paid visual belongs only to the four solo strategy booths,
          // not to any trivia session that happens to carry solver metadata.
          // The mode comes from the locked review RPC, never from the body.
          if (!isStrategyVisualCardMode(review.mode)) {
              return res.status(400).json({ success: false, error: 'unsupported_session_mode' });
          }
          if (review.voided === true || review.outcome === 'voided') {
              return res.status(422).json({ success: false, error: 'solver_analysis_unavailable' });
          }
          if (!UUID_RE.test(review.revisionId || '')) {
              return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
          }
          if (!isStrategyVisualCardCategory(review.category)) {
              return res.status(400).json({ success: false, error: 'Question is not a GTO-category question' });
          }
          if (!canRenderStrategyVisualCard(review.mode, review.category)) {
              return res.status(409).json({ success: false, error: 'strategy_mode_category_mismatch' });
          }

          const options = Array.isArray(review.options) ? review.options : [];
          const correctIndex = Number.isInteger(review.correctIndex) ? review.correctIndex : -1;
          if (correctIndex < 0 || correctIndex >= options.length) {
              return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
          }
          const category = review.category;
          const action = extractAction(options[correctIndex]);
          const solverAnalysis = sanitizeSolverAnalysis(review.engineMetadata);
          if (!solverAnalysis) {
              return res.status(422).json({ success: false, error: 'solver_analysis_unavailable' });
          }

          const actionFrequency = solverAnalysis.frequencies[action] ?? null;
          const frequencyRows = Object.entries(solverAnalysis.frequencies)
              .map(([solverAction, frequency]) => ({ action: solverAction, frequency }))
              .sort((a, b) => b.frequency - a.frequency || a.action.localeCompare(b.action));
          const evValue = solverAnalysis.ev
              ? `${solverAnalysis.ev.value >= 0 ? '+' : ''}${solverAnalysis.ev.value.toFixed(2)} ${solverAnalysis.ev.unit}`
              : null;

          const explanation = clamp(review.explanation || 'No authored explanation is available for this solved spot.', 200);

          // The source evidence is part of the key. If a reviewed solve is
          // corrected, the old image can never masquerade as the new one.
          const { cacheDigest, cacheKey } = generateCacheIdentity({
              questionId,
              revisionId: review.revisionId,
              action,
              frequencyRows,
              ev: solverAnalysis.ev,
              source: solverAnalysis.source,
              renderVersion: 'club-arena-console-v1',
          });

          const ownerToken = crypto.randomUUID();
          const rendered = await renderGtoPanelSingleflight({
              cacheDigest,
              ownerToken,
              leaseSeconds: RENDER_CLAIM_LEASE_SECONDS,
              readCachedImage: () => checkCachedImage(cacheKey),
              claimRender: claimRenderLease,
              generateImage: () => generateWithGrok({
                  action,
                  actionFrequency,
                  frequencyRows,
                  explanation,
                  evValue,
                  category,
              }),
              uploadImage: imageBuffer => uploadToStorage(cacheKey, imageBuffer),
              releaseRender: releaseRenderLease,
              onReleaseError: (releaseError, { primaryError }) => {
                  console.warn('[Trivia-GTO-Panel] Claim release failed:', releaseError?.message || releaseError);
                  try {
                      reportApiError(releaseError, {
                          route: '/api/trivia/render-gto-panel',
                          stage: 'claim_release',
                          primaryOperationFailed: Boolean(primaryError),
                      });
                  } catch (_reportError) {
                      console.warn('[App] Handled exception:', _reportError?.message || _reportError);
                  }
              },
          });

          if (rendered.state === 'pending') {
              res.setHeader('Retry-After', String(Math.max(1, Math.ceil(rendered.retryAfterMs / 1000))));
              return res.status(409).json({
                  success: false,
                  error: 'render_in_progress',
                  retryAfterMs: rendered.retryAfterMs,
              });
          }

          return res.status(200).json({
              success: true,
              imageUrl: rendered.imageUrl,
              fromCache: rendered.fromCache,
              illustrative: false,
              solverSource: solverAnalysis.source,
          });

      } catch (error) {
          console.warn('[Trivia-GTO-Panel] Error:', error);
          return res.status(500).json({
              success: false,
              error: error.message,
          });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
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
    actionFrequency,
    frequencyRows,
    explanation,
    evValue,
    category,
}) {
    const actionColor = ACTION_COLORS[action] || 'electric table blue';
    const mix = frequencyRows.length > 0
        ? frequencyRows.map(row => `${row.action}: ${row.frequency}%`).join(', ')
        : 'No action frequencies supplied';
    const primaryFrequency = actionFrequency == null
        ? 'No preferred-line frequency supplied'
        : `${action}: ${actionFrequency}%`;
    const evLine = evValue == null ? 'No EV value supplied' : `EV: ${evValue}`;

    const prompt = `Create one premium poker analysis evidence plate for Smarter Poker.

SCENE AND MATERIALS:
- True black casino void, not a blue gradient.
- One machined gunmetal instrument frame with sharp chamfered corners, cold chrome fasteners, carbon-fiber inlay and restrained electric-blue edge energy.
- It must feel physically mounted beside a real high-stakes poker table, with shallow-depth table felt and chips visible beyond the instrument. No floating dashboard cards.
- No glassmorphism, no purple, no magenta, no generic sci-fi HUD, no robot face, no pill buttons, no rounded SaaS panels.

VERIFIED SERVER DATA ONLY:
- Category: "${clamp(category, 48)}"
- Preferred action: "${action}" in ${actionColor}
- Preferred-line evidence: "${primaryFrequency}"
- Complete supplied mix: "${mix}"
- Supplied EV evidence: "${evLine}"
- Authored explanation: "${explanation}"
- Source legend: "VERIFIED SERVER METADATA"

COMPOSITION:
- Wide landscape analysis plate, legible hierarchy, restrained blue illumination and a small prize-gold accent only on the preferred action.
- Present only the exact values above. Do not infer, add, round differently, or invent any percentage, range, EV, confidence, action, reason or claim.
- If a field says no value supplied, omit that metric area instead of filling it.
- No logos, no watermark, no decorative icon set, no fictional controls.`;

    // Call Grok image generation
    const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        signal: AbortSignal.timeout(90_000),
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
 * Generate a full digest for durable coordination and retain the established
 * storage object key for cache compatibility.
 */
function generateCacheIdentity(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    const cacheDigest = hash.digest('hex');
    return {
        cacheDigest,
        cacheKey: `trivia-gto-${cacheDigest.substring(0, 16)}`,
    };
}

async function claimRenderLease({ cacheDigest, ownerToken, leaseSeconds }) {
    const { data, error } = await getSupabase().rpc('trivia_claim_gto_render_v1', {
        p_cache_digest: cacheDigest,
        p_owner_token: ownerToken,
        p_lease_seconds: leaseSeconds,
    });
    if (error || typeof data?.acquired !== 'boolean') {
        console.warn('[Trivia-GTO-Panel] Claim failed:', error?.message || 'invalid claim response');
        throw new Error('GTO render coordination unavailable');
    }
    return data;
}

async function releaseRenderLease({ cacheDigest, ownerToken }) {
    const { data, error } = await getSupabase().rpc('trivia_release_gto_render_v1', {
        p_cache_digest: cacheDigest,
        p_owner_token: ownerToken,
    });
    if (error || data !== true) {
        throw new Error(error?.message || 'GTO render claim was not released by its owner');
    }
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
        try { reportApiError(error, { route: '/api/trivia/render-gto-panel', stage: 'cache_check' }); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
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
