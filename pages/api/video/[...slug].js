/**
 * /api/video/* — Hono catch-all router (Phase 4.4 module #9, 2026-04-29)
 *
 * Consolidates 5 previously-separate handlers under a single Hono app.
 * Same pattern as live-help/promo/employee/venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/video):
 *   GET  /analyze-wolfgang   — batch-analyze 4 Wolfgang Poker videos (no auth, internal-fetch)
 *   GET  /analyze            — fetch transcript + Grok GTO analysis (eitherAuth)
 *   POST /tag                — Grok tag generator for a single video (CRON_SECRET only)
 *   GET  /tag                — batch backfill tags for untagged videos (CRON_SECRET only)
 *   POST /transcode          — queue server-side transcoding job (userAuth)
 *   GET  /transcode-status   — poll transcode progress (userAuth)
 *
 * Replaces:
 *   analyze-wolfgang.js  (56 LOC)
 *   analyze.js           (294 LOC)
 *   tag.js               (246 LOC)
 *   transcode.js         (107 LOC)
 *   transcode-status.js  (64 LOC)
 *   = 767 LOC, now ~580 LOC with shared middleware.
 *
 * Auth pattern (per-route):
 *   - public:    analyze-wolfgang (preserves prior behavior — calls /analyze internally)
 *   - eitherAuth: analyze (CRON_SECRET via x-cron-secret OR Bearer; OR user JWT)
 *   - secretAuth: tag (CRON_SECRET only)
 *   - userAuth:  transcode, transcode-status (via getServerUserWithFallback,
 *                Phase 4.1d ESM-clean — replaces requireAuth pattern)
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getGrokClient } from '../../../src/lib/grokClient';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

const CRON_SECRET = process.env.CRON_SECRET;
const TRANSCODE_TABLE = 'video_transcode_jobs';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Service-role client for transcode (cross-user post lookup)
let _adminSupabase = null;
function getAdminSupabase() {
  if (!_adminSupabase) {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return null;
    const { createClient: createSupClient } = require('@supabase/supabase-js');
    _adminSupabase = createSupClient(url, key);
  }
  return _adminSupabase;
}

// ─── Wolfgang batch source (preserved from analyze-wolfgang.js) ──────────
const WOLFGANG_VIDEOS = [
  { id: 'wolf1', videoId: 'CTZeYizF-g0', title: 'Playing High Stakes with Rampage and Mariano' },
  { id: 'wolf2', videoId: 'clZ-r2QDcbY', title: 'WSOP Vlog - Deep Run Dreams' },
  { id: 'wolf3', videoId: 's0WWs2e2Vhc', title: 'I Win My BIGGEST Pot EVER at $5/10' },
  { id: 'wolf4', videoId: '8XbnLzZIy7Q', title: 'Short Form Poker Content is INSANE!' },
];

// ─── YouTube transcript fetcher (preserved from analyze.js) ──────────────
async function fetchYouTubeTranscript(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const html = await response.text();
    const captionsMatch = html.match(/"captions":\s*({[^}]+})/);
    if (!captionsMatch) return null;

    const transcriptResponse = await fetch(
      `https://yt.lemnoslife.com/noKey/captions?videoId=${videoId}&lang=en`
    );
    if (transcriptResponse.ok) {
      const data = await transcriptResponse.json();
      if (data && data.subtitles) {
        return data.subtitles.map(s => `[${formatTimestamp(s.start)}] ${s.text}`).join('\n');
      }
    }

    const altResponse = await fetch(
      `https://youtubetranscript.com/?server_vid2=${videoId}`
    );
    if (altResponse.ok) {
      const altData = await altResponse.text();
      if (altData && altData.length > 100) return altData;
    }

    return null;
  } catch (error) {
    console.warn('[video/analyze] transcript err:', error);
    return null;
  }
}

function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function generateVideoAnalysis(videoTitle, transcript) {
  const grok = getGrokClient();
  const prompt = `You are Jarvis, an expert poker coach and analyst. Analyze this poker video transcript and provide:

VIDEO TITLE: "${videoTitle}"

TRANSCRIPT:
${transcript.substring(0, 15000)} ${transcript.length > 15000 ? '... [truncated]' : ''}

Please provide your analysis in this exact JSON format:
{
    "chapters": [
        {"timestamp": "0:00", "title": "Introduction", "description": "Brief description"},
        {"timestamp": "MM:SS", "title": "Chapter Title", "description": "What happens in this section"}
    ],
    "keyHands": [
        {
            "timestamp": "MM:SS",
            "title": "Hand Title (e.g., 'Hero 3-bets with AKs')",
            "situation": "Brief setup of the hand",
            "analysis": "GTO analysis and what the correct play was",
            "result": "What actually happened"
        }
    ],
    "summary": "2-3 sentence summary of the video's poker content",
    "learningPoints": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"]
}

Focus on actual poker hands and strategy moments. If no specific hands are discussed, focus on general poker content and insights.`;

  const response = await grok.chat.completions.create({
    model: 'grok-3-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content || '';
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('[video/analyze] JSON parse fail:', e);
  }

  return {
    chapters: [{ timestamp: '0:00', title: 'Video Start', description: 'Beginning of video' }],
    keyHands: [],
    summary: 'Analysis could not be generated for this video.',
    learningPoints: [],
  };
}

// ─── Tag helpers (preserved from tag.js) ─────────────────────────────────
const PLAYER_HINTS = [
  'Phil Ivey', 'Daniel Negreanu', 'Phil Hellmuth', 'Tom Dwan', 'Garrett Adelstein',
  'Doug Polk', 'Brad Owen', 'Andrew Neeme', 'Wolfgang Poker', 'Rampage Poker',
  'Mariano', 'Jonathan Little', 'Bart Hanson', 'Nick Schulman', 'Jason Koon',
  'Alex Foxen', 'Bryn Kenney', 'Stephen Chidwick', 'Justin Bonomo', 'Ali Imsirovic',
  'Hustler Casino Live', 'Lodge Poker', 'Texas Card House', 'Live at the Bike',
  'WSOP', 'WPT', 'EPT', 'PokerGO', 'Triton', 'Super High Roller',
  'Ryan Feldman', 'Nik Airball', 'Alan Keating', 'Stan Lee', 'JRB',
  'Susie Lee', 'Lynne Ji', 'Nick Vertucci',
];

async function generateTagsWithGrok(videoTitle, source, type, duration) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) return deriveTagsFromTitle(videoTitle, source, type, duration);

  const prompt = `Extract concise tags from this poker video title for a searchable library.

Video Title: "${videoTitle}"
Source/Creator: ${source}
Game Type: ${type || 'unknown'}
Duration: ${duration || 'unknown'}

Known player names to watch for: ${PLAYER_HINTS.slice(0, 20).join(', ')}

Return a JSON array of 5-12 short tag strings covering:
1. Player names mentioned (first and last name as one tag, e.g. "Phil Ivey")
2. Stakes if mentioned (e.g. "$5/$10", "High Stakes", "Nosebleed")
3. Game format (e.g. "Cash Game", "Tournament", "Heads Up", "Final Table")
4. Strategic concepts if clear from title (e.g. "Bluff", "Bad Beat", "All In", "Deep Run")
5. Venue or show name if relevant

Return ONLY a JSON array like: ["Phil Ivey", "High Stakes", "Cash Game", "Bluff Caught"]
No explanation, no markdown fences, just the JSON array.`;

  try {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!r.ok) {
      console.warn('[video/tag] Grok API error:', r.status);
      return deriveTagsFromTitle(videoTitle, source, type, duration);
    }

    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '[]';
    const cleaned = raw.replace(/```json?/g, '').replace(/```/g, '').trim();
    const tags = JSON.parse(cleaned);
    if (!Array.isArray(tags)) throw new Error('Not an array');

    return [...new Set(
      tags.filter(t => typeof t === 'string' && t.length > 1).map(t => t.trim().slice(0, 40))
    )].slice(0, 15);
  } catch (err) {
    console.warn('[video/tag] parse err:', err?.message);
    return deriveTagsFromTitle(videoTitle, source, type, duration);
  }
}

function deriveTagsFromTitle(title, source, type, duration) {
  const tags = [];
  const lower = title.toLowerCase();

  if (type === 'tournament' || lower.includes('tournament') || lower.includes('wsop') || lower.includes('wpt') || lower.includes('ept')) {
    tags.push('Tournament');
  } else {
    tags.push('Cash Game');
  }

  const stakesMatch = title.match(/\$(\d+)\/?\$?(\d+)/);
  if (stakesMatch) tags.push(`$${stakesMatch[1]}/$${stakesMatch[2]}`);
  if (lower.includes('high roller') || lower.includes('high stakes')) tags.push('High Stakes');
  if (lower.includes('nosebleed')) tags.push('Nosebleed');

  if (lower.includes('heads up') || lower.includes('heads-up')) tags.push('Heads Up');
  if (lower.includes('final table')) tags.push('Final Table');
  if (lower.includes('all in') || lower.includes('allin')) tags.push('All In');
  if (lower.includes('bluff')) tags.push('Bluff');
  if (lower.includes('bad beat')) tags.push('Bad Beat');

  if (duration) {
    const parts = duration.split(':').map(Number);
    const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
    if (secs > 3600) tags.push('Long Session');
    else if (secs < 900) tags.push('Short Clip');
  }

  for (const player of PLAYER_HINTS.slice(0, 10)) {
    if (title.toLowerCase().includes(player.toLowerCase())) tags.push(player);
  }

  return [...new Set(tags)].slice(0, 12);
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/video');

// Per-route middlewares
const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return c.json({ success: false, error: 'Authentication required' }, 401);
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[video] auth err:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
};

const secretAuth = async (c, next) => {
  const secret = c.req.header('x-cron-secret') || (c.req.header('authorization') || '').replace('Bearer ', '');
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

const eitherAuth = async (c, next) => {
  const secret = c.req.header('x-cron-secret') || (c.req.header('authorization') || '').replace('Bearer ', '');
  if (CRON_SECRET && secret === CRON_SECRET) return next();
  try {
    const req = c.env?.req;
    const { user } = await getServerUserWithFallback(req, getSupabase());
    if (user) {
      c.set('user', user);
      return next();
    }
  } catch (err) {
    console.warn('[video] eitherAuth err:', err);
  }
  return c.json({ success: false, error: 'Authentication required' }, 401);
};

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/video/analyze-wolfgang — public batch trigger
app.get('/analyze-wolfgang', async (c) => {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';
  const results = [];

  for (const video of WOLFGANG_VIDEOS) {
    try {
      const response = await fetch(
        `${baseUrl}/api/video/analyze?videoId=${video.videoId}&title=${encodeURIComponent(video.title)}`,
        { method: 'GET' }
      );
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = await response.json();
      results.push({
        videoId: video.videoId,
        title: video.title,
        success: data.success,
        source: data.source,
        hasTranscript: data.transcript_available,
        chapters: data.analysis?.chapters?.length || 0,
        keyHands: data.analysis?.keyHands?.length || 0,
        summary: data.analysis?.summary?.substring(0, 100) || 'N/A',
      });
    } catch (error) {
      results.push({
        videoId: video.videoId,
        title: video.title,
        success: false,
        error: error?.message,
      });
    }
  }

  return c.json({
    message: `Analyzed ${results.filter(r => r.success).length}/${WOLFGANG_VIDEOS.length} Wolfgang Poker videos`,
    results,
  });
});

// GET /api/video/analyze — Grok analyzer (eitherAuth)
app.get('/analyze', eitherAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const videoId = c.req.query('videoId');
    const title = c.req.query('title');
    const forceRefresh = c.req.query('forceRefresh');

    if (!videoId) {
      return c.json({ success: false, error: 'videoId is required' }, 400);
    }

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('video_analysis')
        .select('*')
        .eq('video_id', videoId)
        .maybeSingle();

      if (cached) {
        return c.json({
          success: true,
          source: 'cache',
          analysis: cached.analysis,
          transcript_available: cached.has_transcript,
          created_at: cached.created_at,
        });
      }
    }

    const transcript = await fetchYouTubeTranscript(videoId);
    const isValidTranscript =
      transcript &&
      transcript.length > 500 &&
      !transcript.toLowerCase().includes('youtube') &&
      !transcript.toLowerCase().includes('blocked') &&
      !transcript.toLowerCase().includes('unavailable');

    let analysis;
    if (isValidTranscript) {
      analysis = await generateVideoAnalysis(title || 'Poker Video', transcript);
    } else {
      const grok = getGrokClient();
      const durationMatch = title?.match(/(\d+):(\d+)/);
      const videoDurationMins = durationMatch ? parseInt(durationMatch[1]) : 30;

      const fallbackPrompt = `You are Jarvis, an elite poker coach with deep knowledge of GTO strategy, hand reading, and player dynamics. Based on this poker video title, create a DETAILED and REALISTIC analysis as if you watched the entire video.

  VIDEO TITLE: "${title || 'Poker Video'}"
  APPROXIMATE DURATION: ${videoDurationMins} minutes

  You must generate a comprehensive JSON response. Be creative and specific - imagine the likely content based on the title. Include:
  - Realistic chapter timestamps spread throughout the video duration
  - At least 3-5 key hands that would likely be featured
  - Specific poker analysis (positions, hand ranges, bet sizes, pot odds)
  - Learning points that a viewer would gain

  {
      "chapters": [
          {"timestamp": "0:00", "title": "Introduction", "description": "Setup and intro to the session"},
          {"timestamp": "2:30", "title": "Session Overview", "description": "Stakes, players, and table dynamics"}
      ],
      "keyHands": [
          {
              "timestamp": "5:15",
              "title": "Hero Opens UTG with AKs",
              "situation": "Hero in UTG with AKs facing 6 players",
              "analysis": "Standard 3x open. When facing 3-bet from BTN, calling is correct given stack depths.",
              "result": "Hero calls 3-bet and check-raises turn on Q-7-3-K board"
          }
      ],
      "summary": "Detailed 2-3 sentence summary of what this video covers",
      "learningPoints": [
          "Specific tactical insight from the video",
          "Position-based strategy lesson",
          "Bet sizing or value extraction concept"
      ],
      "note": "AI-generated preview based on video title"
  }

  Make the analysis feel authentic to a real poker video. Use specific card notations, positions, and poker terminology.`;

      const response = await grok.chat.completions.create({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: fallbackPrompt }],
        temperature: 0.7,
        max_tokens: 3000,
      });

      const content = response.choices[0]?.message?.content || '';
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        }
      } catch {
        analysis = {
          chapters: [{ timestamp: '0:00', title: 'Video Start', description: 'Beginning of video' }],
          keyHands: [],
          summary: `Poker video: ${title}`,
          learningPoints: [],
          note: 'Analysis could not be generated',
        };
      }
    }

    const { error: insertError } = await supabase
      .from('video_analysis')
      .upsert({
        video_id: videoId,
        video_title: title,
        analysis,
        has_transcript: !!transcript,
        transcript_length: transcript?.length || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'video_id' });

    if (insertError) console.warn('[video/analyze] cache write err:', insertError);

    return c.json({
      success: true,
      source: 'generated',
      analysis,
      transcript_available: !!transcript,
      transcript_length: transcript?.length || 0,
    });
  } catch (err) {
    console.warn('[video/analyze]', err);
    return c.json({ success: false, error: err?.message || 'Internal server error' }, 500);
  }
});

// POST /api/video/tag — single video (CRON_SECRET only)
app.post('/tag', secretAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { videoId, title, source, type, duration } = body;
    if (!videoId || !title) {
      return c.json({ error: 'videoId and title are required' }, 400);
    }

    const tags = await generateTagsWithGrok(title, source, type, duration);
    const { error } = await supabase
      .from('video_library_videos')
      .update({ tags })
      .eq('youtube_video_id', videoId);

    if (error) throw error;

    return c.json({ videoId, tags, count: tags.length });
  } catch (err) {
    console.warn('[video/tag POST]', err?.message);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
});

// GET /api/video/tag — batch backfill (CRON_SECRET only)
app.get('/tag', secretAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);

    const { data: untagged, error: fetchErr } = await supabase
      .from('video_library_videos')
      .select('youtube_video_id, title, source_id, type, duration, tags')
      .or('tags.is.null,tags.eq.[]')
      .order('scraped_at', { ascending: false })
      .limit(limit);

    if (fetchErr) throw fetchErr;
    if (!untagged?.length) {
      return c.json({ message: 'All videos are tagged', processed: 0 });
    }

    console.log(`[video/tag] Backfilling ${untagged.length} untagged videos...`);

    const results = [];
    const BATCH = 5;
    for (let i = 0; i < untagged.length; i += BATCH) {
      const batch = untagged.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(
        batch.map(async (v) => {
          const tags = await generateTagsWithGrok(v.title, v.source_id, v.type, v.duration);
          const { error } = await supabase
            .from('video_library_videos')
            .update({ tags })
            .eq('youtube_video_id', v.youtube_video_id);
          if (error) throw error;
          return { videoId: v.youtube_video_id, tags };
        })
      );
      results.push(...batchResults);
      if (i + BATCH < untagged.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return c.json({
      processed: untagged.length,
      succeeded,
      failed,
      remaining: Math.max(0, untagged.length - succeeded),
    });
  } catch (err) {
    console.warn('[video/tag GET]', err?.message);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
});

// POST /api/video/transcode — queue transcode job
app.post('/transcode', userAuth, async (c) => {
  const user = c.get('user');
  try {
    const body = await c.req.json().catch(() => ({}));
    const { videoUrl, postId } = body;

    if (!videoUrl || !postId) {
      return c.json({ success: false, error: 'Missing required fields: videoUrl, postId' }, 400);
    }

    const adminSb = getAdminSupabase();
    if (!adminSb) {
      return c.json({ success: false, error: 'Server configuration error' }, 500);
    }

    const { data: post } = await adminSb
      .from('social_posts')
      .select('id, author_id')
      .eq('id', postId)
      .maybeSingle();

    if (!post || post.author_id !== user.id) {
      return c.json({ success: false, error: 'Not authorized' }, 403);
    }

    const jobId = `txc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { error: insertError } = await adminSb
      .from(TRANSCODE_TABLE)
      .insert({
        id: jobId,
        post_id: postId,
        user_id: user.id,
        source_url: videoUrl,
        status: 'queued',
        target_format: 'h264_720p',
        target_bitrate: 2_500_000,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.warn('[video/transcode] Insert err (table may not exist):', insertError.message);
      return c.json({
        success: true,
        jobId: null,
        message: 'Transcode queuing skipped — table not configured yet',
      });
    }

    return c.json({ success: true, jobId, message: 'Transcode job queued successfully' });
  } catch (err) {
    console.warn('[video/transcode]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/video/transcode-status — poll progress
app.get('/transcode-status', userAuth, async (c) => {
  const user = c.get('user');
  try {
    const postId = c.req.query('postId');
    if (!postId) {
      return c.json({ success: false, error: 'Missing postId' }, 400);
    }

    const adminSb = getAdminSupabase();
    if (!adminSb) {
      return c.json({ success: false, error: 'Server configuration error' }, 500);
    }

    const { data: job, error } = await adminSb
      .from(TRANSCODE_TABLE)
      .select('id, status, progress, output_url, error_message, created_at, updated_at')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return c.json({
        success: true,
        job: null,
        message: 'No transcode job found (table may not exist)',
      });
    }

    return c.json({ success: true, job: job || null });
  } catch (err) {
    console.warn('[video/transcode-status]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[video] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[video] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
