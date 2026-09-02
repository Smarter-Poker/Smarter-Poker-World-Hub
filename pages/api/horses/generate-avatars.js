/**
 * HORSE AVATAR GENERATOR
 *
 * Generates profile pictures for horses that do not have one, then stores the
 * result permanently in the `avatars` Supabase storage bucket and writes the
 * public URL back to both content_authors.avatar_url and profiles.avatar_url.
 *
 * REQUEST
 *   POST /api/horses/generate-avatars?limit=<1..5>
 *   Body: none (ignored entirely).
 *   Auth, either one:
 *     - `Authorization: Bearer <supabase JWT>` for an operator holding
 *       avatars.generate (this is what the /horses UI sends), or
 *     - `x-admin-secret: <ADMIN_ROUTE_SECRET>` for the cron caller. Compared
 *       with crypto.timingSafeEqual on equal-length buffers, so response
 *       latency does not leak the secret one byte at a time.
 *
 * SPEND CEILING
 *   `limit` is clamped to 1..MAX_BATCH. Each horse in the batch is one PAID
 *   image generation, so the clamp is a spend control, not a paging hint.
 *   MAX_BATCH is 5 because this route's own timing note is accurate: budget
 *   15-25 seconds per horse plus a 2 second gap, so a batch of 10 exceeds a
 *   Vercel serverless function timeout and leaves the run half-finished. Call
 *   repeatedly and drive a progress display from `remaining`.
 *
 * SELECTION
 *   Horses with `avatar_url IS NULL`. A horse that ALREADY HAS AN AVATAR IS
 *   NEVER TOUCHED: it does not match the filter, nothing is overwritten, and no
 *   money is spent on it. To redo an avatar, clear its avatar_url first.
 *
 * A per-horse failure does NOT fail the request. Partial success is reported in
 * `results`, so a caller must read the array rather than trusting the 200.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { getOperatorDb } from '../../../src/lib/horses/operatorAuth.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { requestIdOf, sendFail, sendOk, scrubError } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { stablePick } from '../../../src/lib/horses/hash.js';
import { int } from '../../../src/lib/horses/validate.js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getGrokClient } from '../../../src/lib/grokClient';
import crypto from 'crypto';

const DEFAULT_BATCH = 5;
const MAX_BATCH = 5;

/** Remote image guards. Without these the route downloaded an arbitrary URL of
 *  arbitrary size and type and published it to a public bucket. */
const IMAGE_FETCH_TIMEOUT_MS = 15000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const AVATAR_STYLES = {
  male: [
    'professional poker player portrait, confident expression, casino background, dramatic lighting',
    'serious card player headshot, sophisticated, dark background, studio lighting',
    'casual poker grinder portrait, focused expression, home office background',
  ],
  female: [
    'professional female poker player portrait, confident, casino ambiance, elegant',
    'determined woman card player headshot, sophisticated style, studio lighting',
    'focused female poker pro portrait, modern style, clean background',
  ],
};

export const spec = {
  name: 'horses.generate-avatars',
  methods: ['POST'],
  permission: PERMISSIONS.AVATARS_GENERATE,
  limit: 'ai',
};

/**
 * Constant-time secret comparison. timingSafeEqual throws on a length mismatch,
 * so the lengths are compared first; the length of the secret is not itself
 * worth protecting.
 */
export function secretEquals(candidate, secret) {
  if (typeof candidate !== 'string' || typeof secret !== 'string') return false;
  if (candidate.length === 0 || secret.length === 0) return false;
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isCronCall(req) {
  const header = req?.headers?.['x-admin-secret'];
  const candidate = Array.isArray(header) ? header[0] : header;
  return secretEquals(candidate, process.env.ADMIN_ROUTE_SECRET || '');
}

/**
 * The image prompt. The style used to be picked with `horse.id % n`, and
 * content_authors.id is a uuid, so that was NaN and the literal string
 * "undefined" went into every paid prompt. stablePick hashes the id instead, so
 * the same horse always draws the same style.
 */
export function buildPrompt(horse) {
  const styleOptions = AVATAR_STYLES[horse.gender] || AVATAR_STYLES.male;
  const style = stablePick(styleOptions, horse.id) || styleOptions[0];
  const tone =
    horse.specialty === 'high_stakes' ? 'Upscale, sophisticated look.' : 'Casual but focused appearance.';
  return [
    `Portrait photo of ${horse.name}, a ${horse.gender} poker player from ${horse.location}.`,
    tone,
    style,
    'Photorealistic, high quality, 4K, professional photography.',
  ].join('\n');
}

async function generateAvatar(grok, horse) {
  try {
    const response = await grok.images.generate({
      model: 'dall-e-3',
      prompt: buildPrompt(horse),
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    });
    if (!response?.data?.[0]?.url) {
      console.warn('[generate-avatars] image generation returned no URL for', horse.name);
      return null;
    }
    return response.data[0].url;
  } catch (error) {
    console.warn('[generate-avatars] generation failed for', horse.name, error?.message || error);
    return null;
  }
}

/**
 * Download the generated image with a timeout, a declared-type check and a byte
 * cap, then publish it. Returns { buffer } or { reason } so the caller can skip
 * that horse with a reason instead of uploading whatever came back.
 */
export async function fetchImageBytes(imageUrl, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(imageUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  } catch (err) {
    return { reason: 'Image Download Failed Or Timed Out' };
  }
  if (!response?.ok) return { reason: `Image Download Returned ${response?.status ?? 'No Response'}` };

  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    return { reason: `Image Download Was Not An Image (${contentType || 'No Content Type'})` };
  }

  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    return { reason: 'Image Exceeds The 5 MB Limit' };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) return { reason: 'Image Exceeds The 5 MB Limit' };
  if (buffer.length === 0) return { reason: 'Image Download Was Empty' };
  return { buffer, contentType };
}

async function uploadToStorage(db, imageUrl, horseId) {
  const fetched = await fetchImageBytes(imageUrl);
  if (fetched.reason) return { reason: fetched.reason };

  const filePath = `avatars/horses/horse-${horseId}-avatar.png`;
  try {
    const { error } = await db.storage
      .from('avatars')
      .upload(filePath, fetched.buffer, { contentType: 'image/png', upsert: true });
    if (error) {
      console.warn('[generate-avatars] upload failed:', error.message || error);
      return { reason: 'Upload Failed' };
    }
    const { data: urlData } = db.storage.from('avatars').getPublicUrl(filePath);
    if (!urlData?.publicUrl) return { reason: 'Upload Failed' };
    return { url: urlData.publicUrl };
  } catch (error) {
    console.warn('[generate-avatars] upload threw:', error?.message || error);
    return { reason: 'Upload Failed' };
  }
}

async function remainingCount(db) {
  // Returns null, not 0, when the count cannot be read. `count || 0` made a
  // failed query indistinguishable from "every horse already has an avatar",
  // which is the answer that stops an operator running the batch at all.
  const { count, error } = await db
    .from('content_authors')
    .select('*', { count: 'exact', head: true })
    .is('avatar_url', null);
  if (error) {
    console.warn('[generate-avatars] remaining count failed:', error.message || error);
    return null;
  }
  return count ?? null;
}

export async function handle({ req, op, db, query }) {
  const requested = int(Array.isArray(query.limit) ? query.limit[0] : query.limit, {
    min: 1,
    max: MAX_BATCH,
    fallback: null,
  });
  const limit = requested === null ? DEFAULT_BATCH : Math.min(Math.max(requested, 1), MAX_BATCH);

  // Built inside the handler on purpose. A module-scope client runs during the
  // Next.js build and SSG, where the credential may not exist at all.
  const grok = getGrokClient();

  // The `profile_id IS NOT NULL` filter that used to sit here excluded the 39
  // avatar-less horses with no profiles row, so only 16 were ever reachable and
  // the operator watched the count stall with no explanation. The avatar the
  // Social Horses tab renders is content_authors.avatar_url, and that write
  // needs no profile; the profiles mirror below is conditional instead.
  const { data: horses, error } = await db
    .from('content_authors')
    .select('id, name, gender, location, specialty, profile_id')
    .is('avatar_url', null)
    .limit(limit);
  if (error) {
    console.warn('[generate-avatars] roster read failed:', error.message || error);
    return { generated: 0, attempted: 0, limit, maxBatch: MAX_BATCH, results: [], error: null };
  }
  if (!horses?.length) {
    return {
      message: 'All Horses Have Avatars',
      generated: 0,
      attempted: 0,
      limit,
      maxBatch: MAX_BATCH,
      results: [],
    };
  }

  const results = [];
  for (const horse of horses) {
    const tempUrl = await generateAvatar(grok, horse);
    if (!tempUrl) {
      results.push({ horse: horse.name, success: false, error: 'Generation Failed' });
      continue;
    }

    const uploaded = await uploadToStorage(db, tempUrl, horse.id);
    if (uploaded.reason) {
      results.push({ horse: horse.name, success: false, error: uploaded.reason });
      continue;
    }
    const permanentUrl = uploaded.url;

    // The write that matters: this is what the Social Horses tab renders. A
    // zero-row result means the horse was retired mid-batch and the image we
    // just paid for is orphaned. Say so rather than reporting success.
    const { data: updated, error: caErr } = await db
      .from('content_authors')
      .update({ avatar_url: permanentUrl })
      .eq('id', horse.id)
      .select('id');
    if (caErr || !updated?.length) {
      console.warn(
        '[generate-avatars] content_authors write failed for',
        horse.name,
        caErr?.message || 'no rows matched'
      );
      results.push({
        horse: horse.name,
        success: false,
        error: caErr ? 'Save Failed' : 'Horse No Longer Exists',
        url: permanentUrl,
      });
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // Mirror onto the player profile, but only when there is one. Social-only
    // horses have no profiles row and never sit at a table.
    let mirrored = false;
    if (horse.profile_id) {
      const { data: mirrorRows, error: profErr } = await db
        .from('profiles')
        .update({ avatar_url: permanentUrl })
        .eq('id', horse.profile_id)
        .select('id');
      if (profErr) console.warn('[generate-avatars] profiles mirror failed for', horse.name, profErr.message);
      else if (!mirrorRows || mirrorRows.length === 0) {
        console.warn(
          '[generate-avatars] profiles mirror matched 0 rows for',
          horse.name,
          '- profile_id is stale'
        );
      } else mirrored = true;
    }

    results.push({ horse: horse.name, success: true, url: permanentUrl, mirroredToProfile: mirrored });
    await new Promise((r) => setTimeout(r, 2000));
  }

  const succeeded = results.filter((r) => r.success);
  await auditOperatorAction(op, req, {
    action: 'avatar.generate',
    targetType: 'content_author',
    targetId: null,
    details: {
      authenticated_via: op.role === 'cron' ? 'admin_secret' : 'jwt',
      requested_limit: limit,
      max_batch: MAX_BATCH,
      attempted: results.length,
      generated: succeeded.length,
      failed: results.length - succeeded.length,
      horses: succeeded.map((r) => r.horse),
      failures: results.filter((r) => !r.success).map((r) => ({ horse: r.horse, reason: r.error })),
    },
    after: { generated: succeeded.length },
  });

  return {
    generated: succeeded.length,
    attempted: results.length,
    limit,
    maxBatch: MAX_BATCH,
    remaining: await remainingCount(db),
    results,
  };
}

const jwtRoute = withOperatorRoute(spec, handle);

/**
 * The cron caller has no JWT and therefore no operator context. It gets one
 * built here with a null user id and the role 'cron', so the batch it runs is
 * still filed in admin_audit_log: this route spends money per image, and an
 * unattributed run still has to leave a record.
 */
async function runCronBatch(req, res, requestId) {
  if (!applyRateLimit(req, res, LIMITS.ai || LIMITS.write)) return undefined;
  let db;
  try {
    db = await getOperatorDb();
  } catch (err) {
    console.error('[generate-avatars] service-role client unavailable:', err?.message);
    return sendFail(
      res,
      503,
      'Avatar Generation Is Not Configured On This Server',
      'service_role_missing',
      requestId
    );
  }
  const op = { user: { id: null }, role: 'cron', db, requestId };
  try {
    const payload = await handle({
      req,
      res,
      op,
      db,
      requestId,
      method: 'POST',
      query: req.query || {},
      body: {},
    });
    return sendOk(res, payload, requestId);
  } catch (err) {
    const scrubbed = scrubError(err);
    if (scrubbed.status >= 500) {
      console.error(`[horses.generate-avatars] ${requestId}:`, err?.message || err);
    }
    return sendFail(res, scrubbed.status, scrubbed.message, scrubbed.code, requestId);
  }
}

export default async function generateAvatarsRoute(req, res) {
  const requestId = requestIdOf(req);
  if (String(req.method || 'GET').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendFail(res, 405, 'Method Not Allowed', 'method_not_allowed', requestId);
  }
  if (isCronCall(req)) return runCronBatch(req, res, requestId);
  return jwtRoute(req, res);
}
