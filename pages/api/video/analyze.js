import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Video Analysis API - Fetches YouTube transcript and generates AI analysis
 * Uses Jarvis (Grok) to create:
 * 1. Hand Analysis - GTO breakdown of key hands
 * 2. Auto-generated Chapters - Timestamped sections
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// YouTube transcript fetcher using unofficial API
async function fetchYouTubeTranscript(videoId) {
    try {
        // Try youtube-transcript-api equivalent
        const response = await fetch(
            `https://www.youtube.com/watch?v=${videoId}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const html = await response.text();

        // Extract captions data from YouTube page
        const captionsMatch = html.match(/"captions":\s*({[^}]+})/);
        if (!captionsMatch) {
            return null;
        }

        // Try alternative: use a transcript service
        const transcriptResponse = await fetch(
            `https://yt.lemnoslife.com/noKey/captions?videoId=${videoId}&lang=en`
        );

        if (transcriptResponse.ok) {
            const data = await transcriptResponse.json();
            if (data && data.subtitles) {
                return data.subtitles.map(s => `[${formatTimestamp(s.start)}] ${s.text}`).join('\n');
            }
        }

        // Fallback: Try another transcript API
        const altResponse = await fetch(
            `https://youtubetranscript.com/?server_vid2=${videoId}`
        );
        if (altResponse.ok) {
            const altData = await altResponse.text();
            if (altData && altData.length > 100) {
                return altData;
            }
        }

        return null;
    } catch (error) {
        console.warn('Error fetching transcript:', error);
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

    // Parse JSON from response
    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.warn('Failed to parse JSON:', e);
    }

    return {
        chapters: [{ timestamp: "0:00", title: "Video Start", description: "Beginning of video" }],
        keyHands: [],
        summary: "Analysis could not be generated for this video.",
        learningPoints: []
    };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
      // Allow cron to bypass JWT.
      // SECURITY: the cron bypass only counts when CRON_SECRET is CONFIGURED.
      // This previously FAILED OPEN: with CRON_SECRET unset,
      // `undefined === undefined` made isCron true for any request that sent no
      // x-cron-secret header, skipping the JWT check on this endpoint entirely.
      const envCronSecret = process.env.CRON_SECRET;
      const isCron = Boolean(envCronSecret) && (
                     req.headers['x-cron-secret'] === envCronSecret ||
                     req.headers['authorization'] === `Bearer ${envCronSecret}`);
                     
      if (!isCron) {
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          /* removed duplicate authUser */
          if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      const { videoId, title, forceRefresh } = req.query;

      if (!videoId) {
          return res.status(400).json({ success: false, error: 'videoId is required' });
      }

      try {
          // Check if we already have cached analysis
          if (!forceRefresh) {
              const { data: cached } = await getSupabase()
                  .from('video_analysis')
                  .select('*')
                  .eq('video_id', videoId)
                  .maybeSingle();

              if (cached) {
                  return res.status(200).json({
                      success: true,
                      source: 'cache',
                      analysis: cached.analysis,
                      transcript_available: cached.has_transcript,
                      created_at: cached.created_at
                  });
              }
          }

          // Fetch transcript
          const transcript = await fetchYouTubeTranscript(videoId);

          // Check if transcript is valid (long enough and not an error message)
          const isValidTranscript = transcript &&
              transcript.length > 500 &&
              !transcript.toLowerCase().includes('youtube') &&
              !transcript.toLowerCase().includes('blocked') &&
              !transcript.toLowerCase().includes('unavailable');

          let analysis;
          if (isValidTranscript) {
              analysis = await generateVideoAnalysis(title || 'Poker Video', transcript);
          } else {
              // Generate detailed analysis based on video title using poker expertise
              const grok = getGrokClient();

              // Parse video duration for better chapter timestamps (default 30 min)
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
          {"timestamp": "2:30", "title": "Session Overview", "description": "Stakes, players, and table dynamics"},
          // Add 4-6 more chapters with realistic timestamps
      ],
      "keyHands": [
          {
              "timestamp": "5:15",
              "title": "Hero Opens UTG with AKs",
              "situation": "Hero in UTG with AKs facing 6 players",
              "analysis": "Standard 3x open. When facing 3-bet from BTN, calling is correct given stack depths.",
              "result": "Hero calls 3-bet and check-raises turn on Q-7-3-K board"
          },
          // Add 2-4 more realistic hands
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
              } catch (e) {
                  analysis = {
                      chapters: [{ timestamp: "0:00", title: "Video Start", description: "Beginning of video" }],
                      keyHands: [],
                      summary: `Poker video: ${title}`,
                      learningPoints: [],
                      note: "Analysis could not be generated"
                  };
              }
          }

          // Cache the analysis
          const { error: insertError } = await getSupabase()
              .from('video_analysis')
              .upsert({
                  video_id: videoId,
                  video_title: title,
                  analysis: analysis,
                  has_transcript: !!transcript,
                  transcript_length: transcript?.length || 0,
                  updated_at: new Date().toISOString()
              }, { onConflict: 'video_id' });

          if (insertError) {
              console.warn('Error caching analysis:', insertError);
          }

          return res.status(200).json({
              success: true,
              source: 'generated',
              analysis: analysis,
              transcript_available: !!transcript,
              transcript_length: transcript?.length || 0
          });

      } catch (error) {
          console.warn('Video analysis error:', error);
          return res.status(500).json({
              success: false,
              error: error.message
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}