import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🐴 HORSE AVATAR GENERATOR
 * Generates profile pictures for all horses using AI
 * 
 * POST /api/horses/generate-avatars
 * Generates avatars for horses that don't have one
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (!authErr && user) {
          const { data: profile } = await getSupabase().from('profiles').select('role').eq('id', user.id).maybeSingle();
          if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) isAuthorized = true;
        }
      }
      if (!isAuthorized && envSecret && adminSecret === envSecret) {
        isAuthorized = true;
      }
      if (!isAuthorized) {
          return res.status(401).json({ success: false, error: 'Admin authentication required' });
      }

      const limit = parseInt(req.query.limit) || 5; // Process 5 at a time to avoid timeout


      try {
          // Get horses without avatars
          const { data: horses, error } = await getSupabase()
              .from('content_authors')
              .select('id, name, gender, location, specialty, profile_id')
              .is('avatar_url', null)
              .not('profile_id', 'is', null)
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

              // Update content_authors
              const { error: err_content_authors_q9b4w } = await getSupabase()
                .from('content_authors')
                .update({ avatar_url: permanentUrl })
                  .eq('id', horse.id);
              if (err_content_authors_q9b4w) console.warn('[Supabase] Silent mutation failed in content_authors:', err_content_authors_q9b4w.message);

              // Update profiles
              const { error: err_profiles_g2rzs } = await getSupabase()
                .from('profiles')
                .update({ avatar_url: permanentUrl })
                  .eq('id', horse.profile_id);
              if (err_profiles_g2rzs) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_g2rzs.message);

              results.push({ horse: horse.name, success: true, url: permanentUrl });

              // Small delay between generations
              await new Promise(r => setTimeout(r, 2000));
          }

          return res.status(200).json({
              success: true,
              generated: results.filter(r => r.success).length,
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
    const { count } = await getSupabase()
        .from('content_authors')
        .select('*', { count: 'exact', head: true })
        .is('avatar_url', null)
        .not('profile_id', 'is', null)
            .limit(100);
    return count || 0;
}
