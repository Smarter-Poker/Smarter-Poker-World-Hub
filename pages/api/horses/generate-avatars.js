import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * HORSE AVATAR GENERATOR
 *
 * Generates profile pictures for horses that do not have one, using the image
 * model behind getGrokClient(), then stores the result permanently in the
 * `avatars` Supabase storage bucket and writes the public URL back to both
 * content_authors.avatar_url and profiles.avatar_url.
 *
 * REQUEST
 *   POST /api/horses/generate-avatars?limit=<1..10>
 *   Body: none (ignored entirely).
 *   Query: `limit` only. Optional, defaults to 5, coerced with parseInt and
 *          CLAMPED to 1..10 — a missing, zero, negative, non-numeric or
 *          oversized value can never produce an unbounded run. The clamp is
 *          the spend ceiling for a single call: each horse costs one image
 *          generation.
 *   Auth (either one):
 *     - `Authorization: Bearer <supabase JWT>` for a user whose profiles.role
 *       is admin, superadmin or god (this is what the /horses UI sends), or
 *     - `x-admin-secret: <ADMIN_ROUTE_SECRET>` for server-to-server callers.
 *   Any other method returns 405. Writes are rate limited (LIMITS.write,
 *   30/min).
 *
 * SELECTION
 *   Horses with `avatar_url IS NULL`, capped at
 *   `limit`. A horse that ALREADY HAS AN AVATAR IS NEVER TOUCHED — it does not
 *   match the filter, so no image is generated for it, nothing is overwritten,
 *   and no money is spent on it. There is no force/regenerate flag; to redo an
 *   avatar its avatar_url must first be cleared. In production 55 horses have
 *   no avatar and all 55 are now eligible (a `profile_id IS NOT NULL` filter
 *   used to cut that to 16; see the note at the selector). Of those, 16 are
 *   eligible under the current filter.
 *
 * RESPONSE
 *   200 { message: 'All horses have avatars!', generated: 0 }
 *       when nothing matched the filter (note: no `success` key on this one).
 *   200 { success: true, generated: <n>, remaining: <n>, results: [...] }
 *       where each result is either
 *         { horse: '<name>', success: true,  url: '<public url>' }
 *       or
 *         { horse: '<name>', success: false, error: 'Generation failed' | 'Upload failed' }
 *       `generated` counts only the successful entries; `remaining` re-counts
 *       eligible horses AFTER the run.
 *   401 { success: false, error: 'Admin authentication required' }
 *   405 { success: false, error: 'POST only' }
 *   429 from the rate limiter
 *   500 { success: false, error: 'Internal server error' }
 *
 *   A per-horse failure does NOT fail the request: partial success is reported
 *   in `results`, so the caller must read the array rather than trusting the
 *   200.
 *
 * TIMING
 *   Serial, one horse at a time, with a hardcoded 2-second pause between
 *   horses. Budget roughly 15-25 seconds per horse (image generation, then a
 *   download-and-upload round trip), plus the 2s gap. A batch of 10 is
 *   therefore on the order of 3-4 minutes and WILL EXCEED a typical Vercel
 *   serverless function timeout. Keep interactive batches small (5 or fewer)
 *   and call repeatedly, using `remaining` to drive the progress display.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { logAdminAction } from '../../../src/lib/antiAbuse';

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}
const grok = getGrokClient();

// Avatar style prompts based on persona
const AVATAR_STYLES = {
    male: [
        "professional poker player portrait, confident expression, casino background, dramatic lighting",
        "serious card player headshot, sophisticated, dark background, studio lighting",
        "casual poker grinder portrait, focused expression, home office background"
    ],
    female: [
        "professional female poker player portrait, confident, casino ambiance, elegant",
        "determined woman card player headshot, sophisticated style, studio lighting",
        "focused female poker pro portrait, modern style, clean background"
    ]
};

async function generateAvatar(horse) {
    const styleOptions = AVATAR_STYLES[horse.gender] || AVATAR_STYLES.male;
    const style = styleOptions[horse.id % styleOptions.length];

    const prompt = `Portrait photo of ${horse.name}, a ${horse.gender} poker player from ${horse.location}. 
${horse.specialty === 'high_stakes' ? 'Upscale, sophisticated look.' : 'Casual but focused appearance.'}
${style}
Photorealistic, high quality, 4K, professional photography.`;

    try {
        const response = await grok.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard"
        });

        if (!response?.data?.[0]?.url) {
            console.warn('Image generation returned no URL for horse:', horse.name);
            return null;
        }
        return response.data[0].url;
    } catch (error) {
        console.warn(`Failed to generate avatar for ${horse.name}:`, error.message);
        return null;
    }
}

async function uploadToStorage(imageUrl, horseId) {
    try {
        // Fetch the image
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());

        const fileName = `horse-${horseId}-avatar.png`;
        const filePath = `avatars/horses/${fileName}`;

        // Upload to Supabase storage
        const { data, error } = await getSupabase().storage
            .from('avatars')
            .upload(filePath, buffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = getSupabase().storage
            .from('avatars')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.warn('Upload error:', error);
        return null;
    }
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
      }

      // Auth: Support JWT (from admin UI) or header secret (from cron)
      const authHeader = req.headers.authorization;
      const adminSecret = req.headers['x-admin-secret'];
      const envSecret = process.env.ADMIN_ROUTE_SECRET;
      let isAuthorized = false;
      // Hoisted out of the JWT branch below so the audit write at the end of
      // the handler can attribute the batch. A cron-secret call legitimately
      // has no user, and is filed with a null admin_user_id rather than not
      // being filed at all -- this route spends money per image, so an
      // unattributed run still has to leave a record.
      let auditUserId = null;
      let auditVia = 'admin_secret';

      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (!authErr && user) {
          const { data: profile } = await getSupabase().from('profiles').select('role').eq('id', user.id).maybeSingle();
          if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) {
            isAuthorized = true;
            auditUserId = user.id;
            auditVia = 'jwt';
          }
        }
      }
      if (!isAuthorized && envSecret && adminSecret === envSecret) {
        isAuthorized = true;
      }
      if (!isAuthorized) {
          return res.status(401).json({ success: false, error: 'Admin authentication required' });
      }

      // EXPLICIT, SAFE CLAMP. Every horse in this batch costs one image
      // generation, so the batch size is a spend control, not a paging hint.
      // `parseInt(req.query.limit) || 5` alone accepted `?limit=500` and
      // would have queued 500 paid generations from a single query string.
      // Bounds: 1..MAX_BATCH, default DEFAULT_BATCH, and an unparseable or
      // out-of-range value is coerced rather than honoured.
      const DEFAULT_BATCH = 5;
      const MAX_BATCH = 10;
      const requestedLimit = parseInt(
          Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit,
          10
      );
      const limit = Number.isFinite(requestedLimit)
          ? Math.min(Math.max(requestedLimit, 1), MAX_BATCH)
          : DEFAULT_BATCH;


      try {
          // Get horses without avatars
          // The `profile_id IS NOT NULL` filter that used to be here excluded
          // 39 of the 55 avatar-less horses -- exactly the ones with no
          // profiles row -- so only 16 were ever reachable and the operator
          // would have watched the count stall at 39 remaining with no
          // explanation.
          //
          // That filter only ever existed so the profiles mirror below had an
          // id to write to. But the avatar the Social Horses tab actually
          // renders is content_authors.avatar_url, and that write does not
          // need a profile at all. The mirror is conditional now, and all 55
          // are eligible.
          const { data: horses, error } = await getSupabase()
              .from('content_authors')
              .select('id, name, gender, location, specialty, profile_id')
              .is('avatar_url', null)
              .limit(limit);

          if (error) throw error;
          if (!horses?.length) {
              return res.status(200).json({ message: 'All horses have avatars!', generated: 0 });
          }

          const results = [];

          for (const horse of horses) {

              // Generate avatar
              const tempUrl = await generateAvatar(horse);
              if (!tempUrl) {
                  results.push({ horse: horse.name, success: false, error: 'Generation failed' });
                  continue;
              }

              // Upload to storage
              const permanentUrl = await uploadToStorage(tempUrl, horse.id);
              if (!permanentUrl) {
                  results.push({ horse: horse.name, success: false, error: 'Upload failed' });
                  continue;
              }

              // The write that matters: this is what the Social Horses tab
              // renders. A zero-row result here means the horse was retired
              // mid-batch, and the image we just paid for is orphaned -- say
              // so rather than reporting success.
              const { data: updated, error: caErr } = await getSupabase()
                .from('content_authors')
                .update({ avatar_url: permanentUrl })
                .eq('id', horse.id)
                .select('id');
              if (caErr || !updated?.length) {
                console.warn('[generate-avatars] content_authors write failed for', horse.name, caErr?.message || 'no rows matched');
                results.push({
                  horse: horse.name,
                  success: false,
                  error: caErr ? `Save failed: ${caErr.message}` : 'Horse no longer exists',
                  url: permanentUrl,
                });
                await new Promise(r => setTimeout(r, 2000));
                continue;
              }

              // Mirror onto the player profile, but only when there is one.
              // 39 horses have no profiles row; they are social-only and never
              // sit at a table.
              let mirrored = false;
              if (horse.profile_id) {
                // .select() so a zero-row match is distinguishable from a
                // successful write. Without it mirroredToProfile reported true
                // whenever no error came back, including when profile_id
                // pointed at a row that no longer exists.
                const { data: mirrorRows, error: profErr } = await getSupabase()
                  .from('profiles')
                  .update({ avatar_url: permanentUrl })
                  .eq('id', horse.profile_id)
                  .select('id');
                if (profErr) console.warn('[generate-avatars] profiles mirror failed for', horse.name, profErr.message);
                else if (!mirrorRows || mirrorRows.length === 0) {
                  console.warn('[generate-avatars] profiles mirror matched 0 rows for', horse.name, '- profile_id is stale');
                } else mirrored = true;
              }

              results.push({ horse: horse.name, success: true, url: permanentUrl, mirroredToProfile: mirrored });

              // Small delay between generations
              await new Promise(r => setTimeout(r, 2000));
          }

          // Admin console audit trail. Every horse in this batch is a paid
          // image generation and a permanent write to content_authors.avatar_url
          // (mirrored into profiles), so who ran it and what it produced has to
          // be recoverable. logAdminAction swallows its own errors and can
          // never fail the request.
          const succeeded = results.filter(r => r.success);
          await logAdminAction(getSupabase(), {
              admin_user_id: auditUserId,
              action: 'horses.avatars_generated',
              target_type: 'content_author',
              target_id: null,
              details: {
                  authenticated_via: auditVia,
                  requested_limit: limit,
                  max_batch: MAX_BATCH,
                  attempted: results.length,
                  generated: succeeded.length,
                  failed: results.length - succeeded.length,
                  horses: succeeded.map(r => r.horse),
              },
              req,
          });

          return res.status(200).json({
              success: true,
              generated: results.filter(r => r.success).length,
              attempted: results.length,
              // Echo the clamp that was actually applied, so a UI can show the
              // real batch size rather than the one it asked for.
              limit,
              maxBatch: MAX_BATCH,
              remaining: await getRemainingCount(),
              results
          });

      } catch (error) {
          console.warn('Avatar generation error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function getRemainingCount() {
    // Returns null, not 0, when the count cannot be read. `count || 0` made a
    // failed query indistinguishable from "every horse already has an avatar",
    // which is the answer that stops an operator running the batch at all.
    // The trailing .limit() was also a no-op on a head:true count query.
    const { count, error } = await getSupabase()
        .from('content_authors')
        .select('*', { count: 'exact', head: true })
        .is('avatar_url', null);
    if (error) {
        console.warn('[generate-avatars] remaining count failed:', error.message || error);
        return null;
    }
    return count ?? null;
}
