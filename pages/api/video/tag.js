/**
 * /api/video/tag.js
 * AI Tag Generator for Video Library
 *
 * Calls Grok to extract player names, stakes, game types, and strategic concepts
 * from a video title and metadata, then writes the tags to video_library_videos.tags
 *
 * Auth: CRON_SECRET header (same pattern as /api/video/analyze)
 * Body: { videoId, title, source, type, duration }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

// Lazy-init Supabase admin (avoids crash during Next.js static prerendering when env vars are undefined)
let _supabaseAdmin = null;
function getSupabase() {
    if (!_supabaseAdmin) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabaseAdmin = createClient(url, key);
    }
    return _supabaseAdmin;
}

const CRON_SECRET = process.env.CRON_SECRET;

// Known poker player names to boost detection accuracy
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
    const apiKey = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || '').trim();
    if (!apiKey) {
        // Fallback: derive basic tags from title without AI
        return deriveTagsFromTitle(videoTitle, source, type, duration);
    }

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
        const res = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'grok-3-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 200,
            }),
        });

        if (!res.ok) {
            console.warn('[video/tag] Grok API error:', res.status, await res.text());
            return deriveTagsFromTitle(videoTitle, source, type, duration);
        }

        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content?.trim() || '[]';

        // Strip any accidental markdown fences
        const cleaned = raw.replace(/```json?/g, '').replace(/```/g, '').trim();
        const tags = JSON.parse(cleaned);

        if (!Array.isArray(tags)) throw new Error('Not an array');
        // Sanitize: strings only, max 40 chars each, dedup
        const sanitized = [...new Set(
            tags
                .filter(t => typeof t === 'string' && t.length > 1)
                .map(t => t.trim().slice(0, 40))
        )].slice(0, 15);

        return sanitized;
    } catch (err) {
        console.warn('[video/tag] Tag parse error, falling back:', err.message);
        return deriveTagsFromTitle(videoTitle, source, type, duration);
    }
}

/** Rule-based tag fallback when AI is unavailable */
function deriveTagsFromTitle(title, source, type, duration) {
    const tags = [];
    const lower = title.toLowerCase();

    // Game type
    if (type === 'tournament' || lower.includes('tournament') || lower.includes('wsop') || lower.includes('wpt') || lower.includes('ept')) {
        tags.push('Tournament');
    } else {
        tags.push('Cash Game');
    }

    // Stakes detection
    const stakesMatch = title.match(/\$(\d+)\/?\$?(\d+)/);
    if (stakesMatch) tags.push(`$${stakesMatch[1]}/$${stakesMatch[2]}`);
    if (lower.includes('high roller') || lower.includes('high stakes')) tags.push('High Stakes');
    if (lower.includes('nosebleed')) tags.push('Nosebleed');

    // Format
    if (lower.includes('heads up') || lower.includes('heads-up')) tags.push('Heads Up');
    if (lower.includes('final table')) tags.push('Final Table');
    if (lower.includes('all in') || lower.includes('allin')) tags.push('All In');
    if (lower.includes('bluff')) tags.push('Bluff');
    if (lower.includes('bad beat')) tags.push('Bad Beat');

    // Duration-based tag
    if (duration) {
        const parts = duration.split(':').map(Number);
        const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
        if (secs > 3600) tags.push('Long Session');
        else if (secs < 900) tags.push('Short Clip');
    }

    // Player name detection from known list
    for (const player of PLAYER_HINTS.slice(0, 10)) {
        if (title.toLowerCase().includes(player.toLowerCase())) {
            tags.push(player);
        }
    }

    return [...new Set(tags)].slice(0, 12);
}

export default async function handler(req, res) {
    // Auth check
    const secret = req.headers['x-cron-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!CRON_SECRET || secret !== CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method === 'POST') {
        // Tag a single video
        const { videoId, title, source, type, duration } = req.body || {};
        if (!videoId || !title) {
            return res.status(400).json({ error: 'videoId and title are required' });
        }

        try {
            const tags = await generateTagsWithGrok(title, source, type, duration);

            const { error } = await getSupabase()
                .from('video_library_videos')
                .update({ tags })
                .eq('youtube_video_id', videoId);

            if (error) throw error;

            return res.status(200).json({ videoId, tags, count: tags.length });
        } catch (err) {
            console.error('[video/tag] Single tag error:', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'GET') {
        // Batch backfill mode: tags all untagged videos (tags = [] or null)
        // Query param: ?limit=50 (default 50, max 200)
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

        try {
            // Fetch untagged videos
            const { data: untagged, error: fetchErr } = await getSupabase()
                .from('video_library_videos')
                .select('youtube_video_id, title, source_id, type, duration, tags')
                .or('tags.is.null,tags.eq.[]')
                .order('scraped_at', { ascending: false })
                .limit(limit);

            if (fetchErr) throw fetchErr;
            if (!untagged || untagged.length === 0) {
                return res.status(200).json({ message: 'All videos are tagged', processed: 0 });
            }

            console.log(`[video/tag] Backfilling ${untagged.length} untagged videos...`);

            const results = [];
            // Process in batches of 5 with 200ms gap to be kind to rate limits
            const BATCH = 5;
            for (let i = 0; i < untagged.length; i += BATCH) {
                const batch = untagged.slice(i, i + BATCH);
                const batchResults = await Promise.allSettled(
                    batch.map(async (v) => {
                        const tags = await generateTagsWithGrok(
                            v.title,
                            v.source_id,
                            v.type,
                            v.duration
                        );
                        const { error } = await getSupabase()
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

            return res.status(200).json({
                processed: untagged.length,
                succeeded,
                failed,
                remaining: Math.max(0, untagged.length - succeeded),
            });
        } catch (err) {
            console.error('[video/tag] Batch backfill error:', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
