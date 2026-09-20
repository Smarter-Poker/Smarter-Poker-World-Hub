/**
 * Reels API - Get Poker Reels from Social Feed
 * Pulls from social_reels table (same as social media feed)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const limit = clampInt(safeQ(req.query.limit), 20, 1, 100);
          const sort = safeQ(req.query.sort) || 'recent';

          // First fetch reels without join to avoid schema cache issues
          let query = getSupabase()
              .from('social_reels')
              // Public feed contract only. This route uses a service-role client,
              // so select('*') could silently expose future internal/moderation
              // columns when the table schema grows.
              .select('id, author_id, caption, thumbnail_url, video_url, view_count, created_at')
              .eq('is_public', true);

          // Sorting options ('random' fetches recent, then shuffles below)
          if (sort === 'popular') {
              query = query.order('view_count', { ascending: false });
          } else {
              query = query.order('created_at', { ascending: false });
          }

          query = query.limit(limit);

          const { data, error } = await query;

          if (error) {
              throw error;
          }
          res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
          if (!data?.length) {
              // A real empty feed is not an outage.
              return res.status(200).json({ success: true, data: [] });
          }

          // Fetch profiles separately to avoid schema cache join errors
          const authorIds = [...new Set(data.map(r => r.author_id).filter(Boolean))];
          let profilesMap = {};

          if (authorIds.length > 0) {
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, username, full_name, avatar_url')
                  .in('id', authorIds)
                      .limit(100);

              if (profiles) {
                  profilesMap = profiles.reduce((acc, p) => {
                      acc[p.id] = p;
                      return acc;
                  }, {});
              }
          }

          // Transform data to include author info and extract title from caption
          // (\u{1F3AC} = clapper-board emoji prefix some captions carry)
          let result = data.filter(reel => typeof reel.video_url === 'string' && reel.video_url.trim()).map(reel => {
              const profile = profilesMap[reel.author_id];
              return {
                  id: reel.id,
                  caption: reel.caption || '',
                  thumbnail_url: reel.thumbnail_url || null,
                  video_url: reel.video_url || null,
                  view_count: reel.view_count || 0,
                  created_at: reel.created_at,
                  title: reel.caption?.split('\n')[0]?.replace(/^\u{1F3AC}\s*/u, '') || 'Poker Reel',
                  channel_name: profile?.full_name || profile?.username || 'Smarter.Poker',
                  profiles: profile ? {
                      username: profile.username || null,
                      full_name: profile.full_name || null,
                      avatar_url: profile.avatar_url || null
                  } : null
              };
          });

          // Shuffle if random sort requested.
          // Phase 62: Fisher-Yates instead of biased sort(()=>Math.random()-0.5)
          // (some permutations 2x more likely; visible in feed-rank skew over time).
          if (sort === 'random') {
              for (let i = result.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [result[i], result[j]] = [result[j], result[i]];
              }
          }

          return res.status(200).json({ success: true, data: result });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('Reels API exception:', error?.message || error);
          return res.status(500).json({ success: false, error: 'Reels feed unavailable' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
