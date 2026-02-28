/**
 * Tournament Story API
 * POST /api/commander/tournaments/[id]/story
 * 
 * Creates tournament-themed stories in the social_stories table.
 * Players can share milestone moments from their tournament journey.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Tournament-themed gradient backgrounds
const TOURNAMENT_GRADIENTS = {
    registered: 'linear-gradient(135deg, #1877F2 0%, #0A5DC2 100%)',
    chip_update: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    itm: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    final_table: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
    winner: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 50%, #F59E0B 100%)',
    bubble: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    custom: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
};

const VALID_STORY_TYPES = ['registered', 'chip_update', 'itm', 'final_table', 'winner', 'bubble', 'custom'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Auth via Bearer token (player auth)
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { id: tournamentId } = req.query;
    const {
        story_type = 'custom',
        content,
        media_url,
        chip_count,
        finish_position,
        payout_amount
    } = req.body;

    if (!VALID_STORY_TYPES.includes(story_type)) {
        return res.status(400).json({
            success: false,
            error: `Invalid story_type. Must be one of: ${VALID_STORY_TYPES.join(', ')}`
        });
    }

    try {
        // Get tournament details
        const { data: tournament, error: tErr } = await supabase
            .from('commander_tournaments')
            .select('name, venue_id, status, current_level, blind_structure')
            .eq('id', tournamentId)
            .single();

        if (tErr || !tournament) {
            return res.status(404).json({ success: false, error: 'Tournament not found' });
        }

        // Get player's entry to verify participation
        const { data: entry } = await supabase
            .from('commander_tournament_entries')
            .select('id, status, current_chips, finish_position, payout_amount, table_number, seat_number')
            .eq('tournament_id', tournamentId)
            .eq('player_id', user.id)
            .single();

        if (!entry) {
            return res.status(403).json({ success: false, error: 'You are not registered in this tournament' });
        }

        // Build story content
        const storyContent = content || buildStoryContent(story_type, {
            tournamentName: tournament.name,
            chipCount: chip_count || entry?.current_chips,
            finishPosition: finish_position || entry?.finish_position,
            payoutAmount: payout_amount || entry?.payout_amount,
            level: tournament.current_level,
            blinds: tournament.blind_structure?.[tournament.current_level]
        });

        // Create story
        const { data: story, error: storyErr } = await supabase
            .from('social_stories')
            .insert({
                author_id: user.id,
                content: storyContent,
                media_url: media_url || null,
                media_type: media_url ? 'image' : 'text',
                background_color: TOURNAMENT_GRADIENTS[story_type] || TOURNAMENT_GRADIENTS.custom
            })
            .select()
            .single();

        if (storyErr) {
            console.error('[story.js] Failed to create story:', storyErr);
            return res.status(500).json({ success: false, error: 'Failed to create story' });
        }

        return res.status(201).json({
            success: true,
            data: {
                story_id: story.id,
                content: storyContent,
                story_type,
                tournament_name: tournament.name
            }
        });
    } catch (error) {
        console.error('[story.js] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

function buildStoryContent(type, ctx) {
    const { tournamentName, chipCount, finishPosition, payoutAmount, level, blinds } = ctx;

    switch (type) {
        case 'registered':
            return `Just registered for ${tournamentName}! Let's go! 🏆`;

        case 'chip_update': {
            const chipStr = chipCount ? chipCount.toLocaleString() : '???';
            const blindStr = blinds
                ? `Level ${(level || 0) + 1} — ${blinds.small_blind?.toLocaleString()}/${blinds.big_blind?.toLocaleString()}`
                : '';
            return `Sitting on ${chipStr} chips in ${tournamentName}! ${blindStr} 💪`;
        }

        case 'itm':
            return payoutAmount
                ? `IN THE MONEY! 💰 Finished ${addOrdinal(finishPosition)} in ${tournamentName} — $${payoutAmount.toLocaleString()}`
                : `IN THE MONEY! 💰 Cashed in ${tournamentName}!`;

        case 'final_table':
            return `FINAL TABLE! 🔥 ${tournamentName} — Let's close it out!`;

        case 'winner':
            return payoutAmount
                ? `I WON ${tournamentName}! 🏆🏆🏆 $${payoutAmount.toLocaleString()}`
                : `I WON ${tournamentName}! 🏆🏆🏆`;

        case 'bubble':
            return `Bubbled ${tournamentName}. 😤 So close! Next time.`;

        case 'custom':
        default:
            return `Playing in ${tournamentName}!`;
    }
}

function addOrdinal(n) {
    if (!n) return '';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
