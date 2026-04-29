/**
 * Re-fetch Images - Fetches og:image from article source URLs
 * This updates existing articles with real thumbnail images
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Default/bad images to detect (we want to replace these with real images)
const DEFAULT_IMAGE_PATTERNS = [
    'unsplash.com',
    'pexels.com',
    'placeholder',
    'lh3.googleusercontent.com',  // Google's generic thumbnails
    'gstatic.com',
    'google.com/images'
];

/**
 * Extract the REAL destination URL from a Google News redirect page
 */
async function extractRealUrlFromGoogleNews(googleUrl) {
    if (!googleUrl || !googleUrl.includes('news.google.com')) {
        return googleUrl;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(googleUrl, {
            signal: controller.signal,
            redirect: 'manual',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });

        clearTimeout(timeout);

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location && !location.includes('google.com')) {
                return location;
            }
        }

        const html = await response.text();

        // Meta refresh
        let match = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return decodeURIComponent(match[1]);
        }

        // JavaScript redirect
        match = html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return match[1];
        }

        // data-url attribute
        match = html.match(/data-url=["']([^"']+)["']/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return decodeURIComponent(match[1]);
        }

        // href in article link
        match = html.match(/<a[^>]+href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["'][^>]*>/i);
        if (match && match[1]) {
            return match[1];
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Fetch og:image from the ACTUAL article page
 */
async function fetchOgImage(url) {
    if (!url) return null;

    try {
        // If it's a Google News URL, first get the REAL article URL
        let actualUrl = url;
        if (url.includes('news.google.com')) {
            const realUrl = await extractRealUrlFromGoogleNews(url);
            if (realUrl) {
                actualUrl = realUrl;
            } else {
                return null;
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(actualUrl, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        clearTimeout(timeout);

        if (!response.ok) return null;

        const html = await response.text();

        // Extract og:image
        let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (!match) {
            match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        }

        // Try twitter:image
        if (!match) {
            match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
            if (!match) {
                match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
            }
        }

        if (match && match[1]) {
            let imageUrl = match[1].replace(/&amp;/g, '&');

            // Skip Google images
            if (imageUrl.includes('googleusercontent.com') ||
                imageUrl.includes('gstatic.com') ||
                imageUrl.includes('google.com')) {
                return null;
            }

            // Skip logos/icons
            if (imageUrl.includes('logo') || imageUrl.includes('icon') || imageUrl.includes('favicon')) {
                return null;
            }

            if (imageUrl.startsWith('http')) {
                return imageUrl;
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

export default async function handler(req, res) {
  // Admin-only route — require CRON_SECRET authorization
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
          return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });
      }

      let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

      try {
          // Get articles that have default/placeholder images
          const { data: articles, error: fetchError } = await getSupabase()
              .from('poker_news')
              .select('id, title, source_url, image_url, category')
              .order('published_at', { ascending: false })
              .limit(50); // Process most recent 50

          if (fetchError) throw fetchError;

          // Filter to articles with default images
          const articlesToUpdate = (articles || []).filter(a => {
              if (!a.image_url) return true;
              return DEFAULT_IMAGE_PATTERNS.some(pattern => a.image_url.includes(pattern));
          });


          let updated = 0;
          let failed = 0;
          const results = [];

          for (const article of articlesToUpdate) {

              const newImageUrl = await fetchOgImage(article.source_url);

              if (newImageUrl) {
                  const { error: updateError } = await getSupabase()
                      .from('poker_news')
                      .update({ image_url: newImageUrl })
                      .eq('id', article.id);

                  if (!updateError) {
                      updated++;
                      results.push({ id: article.id, title: article.title.substring(0, 40), newImage: newImageUrl.substring(0, 60) });
                  } else {
                      failed++;
                  }
              } else {
                  failed++;
              }

              // Small delay to be nice to servers
              await new Promise(r => setTimeout(r, 500));
          }

          return res.status(200).json({
              success: true,
              total: articlesToUpdate.length,
              updated,
              failed,
              results
          });

      } catch (error) {
          console.warn('Error refetching images:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
