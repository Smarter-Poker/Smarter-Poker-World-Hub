/**
 * Reels API - Get Poker Reels from Social Feed
 * Pulls from social_reels table (same as social media feed)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

// Fallback data when DB unavailable
const FALLBACK_REELS = [
    { id: 1, caption: "INSANE River Bluff at WSOP", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 1250000 },
    { id: 2, caption: "Phil Hellmuth LOSES IT", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 890000 },
    { id: 3, caption: "When You Flop the NUTS", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 654000 },
    { id: 4, caption: "Pocket Aces vs Kings - $100K Pot", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 2100000 },
    { id: 5, caption: "GTO Play That SHOCKED Everyone", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 432000 },
    { id: 6, caption: "HUGE Cooler at High Stakes", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 780000 }
];

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const limit = safeQ(req.query.limit) || 20;
          const featured = safeQ(req.query.featured);
          const sort = safeQ(req.query.sort) || 'recent';

          // First fetch reels without join to avoid schema cache issues
          let query = getSupabase()
              .from('social_reels')
              .select('*')
              .eq('is_public', true)
                  .limit(100);

          // Sorting options
          if (sort === 'popular') {
              query = query.order('view_count', { ascending: false })
                  .limit(100);
          } else if (sort === 'random') {
              query = query.order('created_at', { ascending: false })
                  .limit(100);
          } else {
              query = query.order('created_at', { ascending: false })
                  .limit(100);
          }

          query = query.limit(parseInt(limit));

          const { data, error } = await query;

          if (error) {
              console.warn('Reels API error:', error.message);
              return res.status(200).json({ success: true, data: FALLBACK_REELS.slice(0, parseInt(limit)) });
          }

          if (!data?.length) {
              return res.status(200).json({ success: true, data: FALLBACK_REELS.slice(0, parseInt(limit)) });
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
          let result = data.map(reel => {
              const profile = profilesMap[reel.author_id];
              return {
                  ...reel,
                  title: reel.caption?.split('\n')[0]?.replace(/^🎬\s*/, '') || 'Poker Reel',
                  channel_name: profile?.full_name || profile?.username || 'Smarter.Poker',
                  profiles: profile,
                  author: profile
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

          res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
          return res.status(200).json({ success: true, data: result });
      } catch (error) {
          console.warn('Reels API exception:', error.message);
          return res.status(200).json({ success: true, data: FALLBACK_REELS });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
