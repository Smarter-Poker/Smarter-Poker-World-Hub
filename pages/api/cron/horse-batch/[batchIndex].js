
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
 * BATCH HORSE CRON - Handles 10 horses per batch
 * 
 * Each batch covers 10 horses:
 * - Batch 0: Horses 0-9
 * - Batch 1: Horses 10-19
 * - ...
 * - Batch 9: Horses 90-99
 * 
 * 10 batches × 10 horses = 100 horses per day
 * Each batch runs at a different hour spread across 24 hours
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import Parser from 'rss-parser';
import { generatePostCaption, generateNewsCaption, seedHorseMemory } from '../../../../src/content-engine/pipeline/HumanVoiceEngine.js';
import { reportApiError } from '../../../../src/lib/sentryWrap';

// ClipLibrary for poker video clips - loaded dynamically
let getRandomClip, CLIP_LIBRARY, clipLibraryLoaded = false;

async function loadClipLibrary() {
    if (clipLibraryLoaded) return true;
    try {
        const lib = await import('../../../../src/content-engine/pipeline/ClipLibrary.js');
        getRandomClip = lib.getRandomClip;
        CLIP_LIBRARY = lib.CLIP_LIBRARY;
        clipLibraryLoaded = true;
        return true;
    } catch (e) {
        console.warn('❌ Failed to load ClipLibrary:', e.message);
        return false;
    }
}

// Validate YouTube video actually exists before posting
async function validateYouTubeVideo(url) {
    if (!url) return false;
    const patterns = [
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/
    ];
    let videoId = null;
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) { videoId = match[1]; break; }
    }
    if (!videoId) return false;

    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        return response.ok;
    } catch {
        return false;
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;


const rssParser = new Parser({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 8000
});

const POKER_NEWS_SOURCES = [
    { name: 'CardPlayer', rss: 'https://www.cardplayer.com/poker-news.rss' },
    { name: 'Upswing Poker', rss: 'https://upswingpoker.com/feed/' },
];

const SPORTS_NEWS_SOURCES = [
    { name: 'ESPN', rss: 'https://www.espn.com/espn/rss/news' },
    { name: 'ESPN NBA', rss: 'https://www.espn.com/espn/rss/nba/news' },
    { name: 'ESPN NFL', rss: 'https://www.espn.com/espn/rss/nfl/news' },
    { name: 'CBS Sports', rss: 'https://www.cbssports.com/rss/headlines/' },
];

async function getHorseSources(profileId) {
    const { data: sportsSources } = await getSupabase().from('sports_clips').select('source').limit(1000);
    const allSources = new Set();
    (sportsSources || []).forEach(s => s.source && allSources.add(s.source));
    const sourceList = [...allSources];
    if (sourceList.length === 0) return [];
    const hash = profileId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const numSources = Math.max(10, Math.floor(sourceList.length / 100));
    const assigned = [];
    for (let i = 0; i < numSources; i++) {
        assigned.push(sourceList[(hash + i * 7) % sourceList.length]);
    }
    return assigned;
}

function convertToEmbedUrl(url) {
    if (!url) return url;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return `https://www.youtube.com/embed/${match[1]}`;
    }
    return url;
}

// POST VIDEO CLIP (with unique voice + GLOBAL DEDUPLICATION + POKER/SPORTS SUPPORT)
async function postVideoClip(horse, assignedSources, horseIndex, clipType = 'sports') {

    let clips = [];
    let clip = null;

    if (clipType === 'poker') {
        if (!clipLibraryLoaded || typeof getRandomClip !== 'function') {
            console.warn(`   ClipLibrary not loaded for poker clips`);
            return { success: false, error: 'ClipLibrary not available' };
        }

        const maxAttempts = 20;
        for (let i = 0; i < maxAttempts; i++) {
            const candidate = getRandomClip();
            if (!candidate) continue;

            const videoId = candidate.video_id || candidate.id;
            const embedUrl = convertToEmbedUrl(candidate.source_url);

            const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const { data: recentVideos } = await getSupabase()
                .from('social_posts')
                .select('media_urls')
                .eq('content_type', 'video')
                .gte('created_at', since48h)
                .limit(100);

            const usedUrls = new Set();
            (recentVideos || []).forEach(p => {
                if (p.media_urls) p.media_urls.forEach(url => usedUrls.add(url));
            });

            if (!usedUrls.has(embedUrl) && !usedUrls.has(candidate.source_url)) {
                const isValid = await validateYouTubeVideo(candidate.source_url);
                if (isValid) {
                    clip = candidate;
                    break;
                } else {
                }
            }
        }

        if (!clip) {
            return { success: false, error: 'All poker clips already posted' };
        }

    } else {
        if (assignedSources.length > 0) {
            const { data } = await getSupabase().from('sports_clips').select('*').in('source', assignedSources).limit(200);
            if (data?.length) clips = data;
        }
        if (!clips.length) {
            const offset = Math.floor(Math.random() * 5000);
            const { data } = await getSupabase().from('sports_clips').select('*').range(offset, offset + 200);
            if (data?.length) clips = data;
        }
        if (!clips.length) return { success: false, error: 'No sports clips' };

        const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentVideos } = await getSupabase()
            .from('social_posts')
            .select('media_urls')
            .eq('content_type', 'video')
            .gte('created_at', since48h)
                .limit(100);

        const usedUrls = new Set();
        (recentVideos || []).forEach(p => {
            if (p.media_urls) p.media_urls.forEach(url => usedUrls.add(url));
        });

        const freshClips = clips.filter(c => {
            const embedUrl = convertToEmbedUrl(c.source_url);
            return !usedUrls.has(embedUrl) && !usedUrls.has(c.source_url);
        });

        if (!freshClips.length) {
            return { success: false, error: 'All sports clips already posted' };
        }

        const maxValidationAttempts = 10;
        for (let i = 0; i < maxValidationAttempts && freshClips.length > 0; i++) {
            const idx = Math.floor(Math.random() * freshClips.length);
            const candidate = freshClips[idx];
            const isValid = await validateYouTubeVideo(candidate.source_url);
            if (isValid) {
                clip = candidate;
                break;
            } else {
                freshClips.splice(idx, 1);
            }
        }

        if (!clip) {
            return { success: false, error: 'No valid sports clips found' };
        }
    }

    // Seed horse memory from recent posts (prevents cross-session repeats)
    const { data: recentCaptions } = await getSupabase()
        .from('social_posts')
        .select('content')
        .eq('author_id', horse.profile_id)
        .order('created_at', { ascending: false })
        .limit(15);
    if (recentCaptions?.length) {
        seedHorseMemory(horse.profile_id, recentCaptions.map(p => p.content?.split('\n')[0] || '').filter(Boolean));
    }

    // Generate human-sounding caption — zero API cost, no Grok
    const clipCategory = clip.category || (clipType === 'poker' ? 'massive_pot' : 'general');
    const caption = generatePostCaption(clipCategory, horse.profile_id, clip.title || '');

    const { data: post, error } = await getSupabase().from('social_posts').insert({
        author_id: horse.profile_id,
        content: caption,
        content_type: 'video',
        media_urls: [convertToEmbedUrl(clip.source_url)],
        visibility: 'public',
        metadata: {
            clip_type: clipType,
            clip_id: clip.id || clip.video_id
        }
    }).select().maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, postId: post.id, type: `${clipType}_video`, caption: caption.slice(0, 50) };
}

// POST NEWS LINK (with unique voice + GLOBAL DEDUPLICATION)
async function postNewsLink(horse, horseIndex, newsType) {

    const sources = newsType === 'poker' ? POKER_NEWS_SOURCES : SPORTS_NEWS_SOURCES;
    const sourceIndex = horseIndex % sources.length;
    const source = sources[sourceIndex];

    try {
        const feed = await rssParser.parseURL(source.rss);
        const allArticles = (feed.items || []).slice(0, 20);
        if (!allArticles.length) return { success: false, error: 'No articles' };

        const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentPosts } = await getSupabase()
            .from('social_posts')
            .select('link_url')
            .not('link_url', 'is', null)
            .gte('created_at', since48h)
                .limit(100);

        const usedLinks = new Set((recentPosts || []).map(p => p.link_url));

        const freshArticles = allArticles.filter(a => !usedLinks.has(a.link));

        if (!freshArticles.length) {
            return { success: false, error: 'All articles already posted' };
        }

        const article = freshArticles[Math.floor(Math.random() * freshArticles.length)];

        // Seed horse memory from recent posts (prevents cross-session repeats)
        const { data: recentNewsCaptions } = await getSupabase()
            .from('social_posts')
            .select('content')
            .eq('author_id', horse.profile_id)
            .order('created_at', { ascending: false })
            .limit(15);
        if (recentNewsCaptions?.length) {
            seedHorseMemory(horse.profile_id, recentNewsCaptions.map(p => p.content?.split('\n')[0] || '').filter(Boolean));
        }

        // Generate human-sounding caption — zero API cost, no Grok
        const caption = generateNewsCaption(article.title || '', horse.profile_id, newsType);
        const postContent = `${caption}\n\n${article.link}`;

        const { data: post, error } = await getSupabase().from('social_posts').insert({
            author_id: horse.profile_id,
            content: postContent,
            content_type: 'link',
            visibility: 'public',
            link_url: article.link,
            link_title: article.title,
            link_site_name: source.name
        }).select().maybeSingle();

        if (error) return { success: false, error: error.message };
        return { success: true, postId: post.id, type: newsType + '_news', title: article.title?.slice(0, 40) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Process a single horse
async function processHorse(horse, horseIndex, horses) {

    // CONTENT: 75% POKER / 25% SPORTS SPLIT
    const hour = new Date().getUTCHours();
    const isPokerHour = (hour % 4 !== 3);
    const contentCategory = isPokerHour ? 'poker' : 'sports';


    const assignedSources = await getHorseSources(horse.profile_id);

    let result;
    if (isPokerHour) {
        result = await postNewsLink(horse, horseIndex, 'poker');
        if (!result.success) {
            result = await postVideoClip(horse, assignedSources, horseIndex, 'poker');
        }
    } else {
        result = await postNewsLink(horse, horseIndex, 'sports');
        if (!result.success) {
            result = await postVideoClip(horse, assignedSources, horseIndex, 'sports');
        }
    }

    return { horse: horse.name, index: horseIndex, ...result };
}

// MAIN HANDLER - Process 10 horses in batch
export default async function handler(req, res) {
  try {
      // Verify cron secret
      if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
          return res.status(401).json({ error: 'Unauthorized' });
      }
      const { batchIndex } = req.query;
      const batch = parseInt(batchIndex, 10);

      if (isNaN(batch) || batch < 0 || batch > 9) {
          return res.status(400).json({ error: 'batchIndex must be 0-9' });
      }

      const startIndex = batch * 10;
      const endIndex = startIndex + 9;

      try {

          // Load ClipLibrary for poker video clips
          await loadClipLibrary();

          // Get all active horses
          const { data: horses, error: horseError } = await getSupabase()
              .from('content_authors')
              .select('*')
              .eq('is_active', true)
              .not('profile_id', 'is', null)
              .order('profile_id')
                  .limit(100);

          if (horseError || !horses?.length) {
              return res.status(200).json({ success: false, error: 'No horses found' });
          }


          // Process horses in this batch
          const results = [];
          for (let i = startIndex; i <= endIndex && i < horses.length; i++) {
              const horse = horses[i];
              if (!horse) continue;

              try {
                  const result = await processHorse(horse, i, horses);
                  results.push(result);

                  // Small delay between horses to avoid rate limiting
                  await new Promise(r => setTimeout(r, 500));
              } catch (err) {
                  console.warn(`Error processing horse ${i}:`, err.message);
                  results.push({ horse: horse?.name, index: i, success: false, error: err.message });
              }
          }

          const successCount = results.filter(r => r.success).length;
          const failCount = results.filter(r => !r.success).length;


          return res.status(200).json({
              success: true,
              batch,
              horsesRange: `${startIndex}-${endIndex}`,
              successCount,
              failCount,
              results
          });

      } catch (error) {
          console.warn('Batch horse cron error:', error);
          return res.status(500).json({ success: false, error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
