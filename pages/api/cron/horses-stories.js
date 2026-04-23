/**
 * 🐴 HORSES STORIES CRON - Horses Post Stories Like TikTok/Instagram
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This cron makes horses post Stories:
 * - 70% video clip stories (from clip library)
 * - 30% text-only stories (poker thoughts, hot takes, reactions)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { generateComment, seedHorseMemory } from '../../../src/content-engine/pipeline/HumanVoiceEngine.js';
import { shouldHorseBeActive, isHorseActiveHour, getHorseActivityRate } from '../../../src/content-engine/pipeline/HorseScheduler.js';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ClipLibrary functions - loaded dynamically
let getRandomClip, getRandomCaption;
let clipLibraryLoaded = false;

async function loadClipLibrary() {
    if (clipLibraryLoaded) return true;
    try {
        const lib = await import('../../../src/content-engine/pipeline/ClipLibrary.js');
        getRandomClip = lib.getRandomClip;
        getRandomCaption = lib.getRandomCaption;
        clipLibraryLoaded = true;
        return true;
    } catch (e) {
        console.warn('Failed to load ClipLibrary:', e.message);
        return false;
    }
}


const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// WARN-S02 FIX: declare getSupabase BEFORE the functions that reference it
const getSupabase = getSupabaseAdmin;

const CONFIG = {
    HORSES_PER_TRIGGER: 2,  // 2 stories per trigger
    VIDEO_STORY_PROBABILITY: 0.70,  // 70% video stories
};


// Story gradients (same as frontend)
const STORY_GRADIENTS = [
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
    'linear-gradient(135deg, #1877F2 0%, #0a5dc2 100%)',
    'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 50%, #6B5B1E 100%)',
    'linear-gradient(135deg, #134E5E 0%, #71B280 100%)',
    'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)',
];

// Text story topics — clean, emoji-free, human-sounding
const TEXT_STORY_TOPICS = [
    'just watched the sickest cooler on stream',
    'solver vs exploitative, the debate never ends',
    'hot take: 3bet sizing in live poker is way too small',
    'worst beat I have ever seen at a live table',
    'late night grinding is a different kind of focus',
    'position is everything, been saying this for years',
    'flopping the nuts and nobody gives you action',
    'live reads hit different than online tells',
    'bankroll management is the most underrated skill in poker',
    'the river is always the cruelest street',
    'ran into the top of his range again',
    'three-bet or fold is the laziest range construction',
    'the mental game matters more than the technical game',
    'a good session is one where you made good decisions',
    'variance is real and nobody is immune',
];


// Validate that a YouTube thumbnail exists and is not a placeholder
async function validateYouTubeThumbnail(videoId) {
    try {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const response = await fetch(thumbnailUrl, { method: 'HEAD' });

        if (!response.ok) return false;

        // YouTube returns a 120x90 gray placeholder for invalid videos
        // We need to actually fetch the image to check its dimensions
        const imageResponse = await fetch(thumbnailUrl);
        const buffer = await imageResponse.arrayBuffer();

        // Check if it's the small placeholder (typically ~2-3KB) vs real thumbnail (typically >20KB)
        const sizeKB = buffer.byteLength / 1024;

        // Real thumbnails are usually 20KB+, placeholders are ~2-3KB
        return sizeKB > 10;
    } catch (e) {
        console.warn(`   Thumbnail validation failed: ${e.message}`);
        return false;
    }
}

async function postVideoStory(horse) {

    try {
        // Try up to 5 different clips to find one with a valid thumbnail
        const maxAttempts = 5;
        let validClip = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const clip = getRandomClip?.();
            if (!clip) continue;

            // Validate the YouTube thumbnail before creating the story
            const isValid = await validateYouTubeThumbnail(clip.video_id);
            if (isValid) { validClip = clip; break; }
        }

        if (!validClip) {
            return null;
        }

        // BUG-S01 FIX: removed '🔥' emoji fallback — use a poker-themed text fallback instead
        const rawCaption = getRandomCaption?.(validClip.category);
        const caption = (rawCaption && rawCaption.trim().length >= 5)
            ? rawCaption.trim()
            : TEXT_STORY_TOPICS[Math.floor(Math.random() * TEXT_STORY_TOPICS.length)];

        // Use YouTube thumbnail as story image (media_type stays 'image' — it IS a static JPEG)
        const thumbnailUrl = `https://img.youtube.com/vi/${validClip.video_id}/hqdefault.jpg`;

        const { data: storyId, error } = await getSupabase().rpc('fn_create_story', {
            p_user_id: horse.profile_id,
            p_content: caption,
            p_media_url: thumbnailUrl,
            p_media_type: 'image',
            p_background_color: null,
            p_link_url: validClip.source_url,  // Links to the actual YouTube video
        });

        if (error) {
            console.warn(`   Story creation failed: ${error.message}`);
            return null;
        }

        return { type: 'video_story', story_id: storyId };
    } catch (e) {
        console.warn(`❌ ${horse.name}: Video story failed - ${e.message}`);
        return null;
    }
}

async function postTextStory(horse) {

    try {
        // Pick random topic
        const topic = TEXT_STORY_TOPICS[Math.floor(Math.random() * TEXT_STORY_TOPICS.length)];
        const gradient = STORY_GRADIENTS[Math.floor(Math.random() * STORY_GRADIENTS.length)];

        // Generate human-sounding story text — zero API cost
        const content = generateComment('general', horse.profile_id) || topic;

        const { data: storyId, error } = await getSupabase().rpc('fn_create_story', {
            p_user_id: horse.profile_id,
            p_content: content,
            p_media_url: null,
            p_media_type: null,
            p_background_color: gradient,
            p_link_url: null,
        });

        if (error) {
            console.warn(`   Story creation failed: ${error.message}`);
            return null;
        }

        return { type: 'text_story', story_id: storyId };
    } catch (e) {
        console.warn(`❌ ${horse.name}: Text story failed - ${e.message}`);
        return null;
    }
}

// Moved above — getSupabase is declared at line ~40 before function definitions

export default async function handler(req, res) {
  try {
      // Verify cron secret
      if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
          return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!SUPABASE_URL) {
          return res.status(500).json({ error: 'Missing env vars' });
      }

      // Load ClipLibrary
      await loadClipLibrary();

      try {
          // Get current time for per-horse scheduling
          const now = new Date();
          const currentMinute = now.getMinutes();
          const currentHour = now.getHours();

          // Get ALL active horses
          const { data: allHorses, error: horseError } = await getSupabase()
              .from('content_authors')
              .select('*')
              .eq('is_active', true)
              .not('profile_id', 'is', null)
                  .limit(100);

          if (horseError || !allHorses?.length) {
              return res.status(200).json({
                  success: true,
                  message: 'No horses available',
                  posted: 0
              });
          }

          // FILTER: Only horses whose time slot matches current minute AND are awake
          const activeHorses = allHorses.filter(horse => {
              const isInSlot = shouldHorseBeActive(horse.profile_id, currentMinute, 3);
              const isAwake = isHorseActiveHour(horse.profile_id, currentHour);
              return isInSlot && isAwake;
          });


          if (activeHorses.length === 0) {
              return res.status(200).json({
                  success: true,
                  message: 'No horses in their active slot this minute',
                  posted: 0,
                  activeHorses: 0
              });
          }

          // Select horses based on activity rate
          const selectedHorses = activeHorses.filter(horse => {
              const rate = getHorseActivityRate(horse.profile_id, 'post');
              return Math.random() < rate;
          }).slice(0, CONFIG.HORSES_PER_TRIGGER);

          const results = [];

          for (const horse of selectedHorses) {
              // Random delay
              await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

              const isVideoStory = Math.random() < CONFIG.VIDEO_STORY_PROBABILITY;
              const result = isVideoStory
                  ? await postVideoStory(horse)
                  : await postTextStory(horse);

              results.push({
                  horse: horse.name,
                  ...result,
                  success: !!result
              });
          }

          const videoStories = results.filter(r => r.type === 'video_story').length;
          const textStories = results.filter(r => r.type === 'text_story').length;


          return res.status(200).json({
              success: true,
              posted: results.filter(r => r.success).length,
              video_stories: videoStories,
              text_stories: textStories,
              results,
              timestamp: new Date().toISOString()
          });

      } catch (error) {
          console.warn('Cron error:', error);
          return res.status(500).json({ success: false, error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
