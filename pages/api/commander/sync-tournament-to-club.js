/**
 * Sync Tournament to Club Page API
 * When a tournament is created/updated/cancelled in Commander,
 * auto-post or update the schedule on the venue's Club Page
 *
 * POST /api/commander/sync-tournament-to-club
 * Body: { venue_id, tournament }
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function formatTournamentPost(tournament) {
    const date = new Date(tournament.scheduled_start);
    const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
    });

    let buyinStr = `$${tournament.buyin_amount}`;
    if (tournament.buyin_fee) buyinStr += `+$${tournament.buyin_fee}`;
    if (tournament.bounty_amount) buyinStr += ` (+$${tournament.bounty_amount} bounty)`;

    const chipsStr = tournament.starting_chips >= 1000
        ? `${(tournament.starting_chips / 1000).toFixed(0)}K`
        : tournament.starting_chips;

    let lines = [
        `TOURNAMENT: ${tournament.name}`,
        `Date: ${dateStr}`,
        `Time: ${timeStr}`,
        `Buy-in: ${buyinStr}`,
        `Starting Stack: ${chipsStr} chips`,
        `Format: ${tournament.tournament_type?.charAt(0).toUpperCase() + tournament.tournament_type?.slice(1) || 'Freezeout'}`,
    ];

    if (tournament.guaranteed_pool) {
        lines.push(`Guaranteed: $${tournament.guaranteed_pool.toLocaleString()}`);
    }

    if (tournament.status === 'cancelled') {
        lines.unshift('[CANCELLED]');
    }

    return lines.join('\n');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { venue_id, tournament } = req.body;

    if (!venue_id || !tournament) {
        return res.status(400).json({ error: 'venue_id and tournament are required' });
    }

    try {
        // 1. Find the Club Page for this venue
        const { data: pages } = await supabase
            .from('social_pages')
            .select('id, owner_id')
            .eq('linked_venue_id', String(venue_id))
            .limit(1);

        if (!pages || pages.length === 0) {
            // No Club Page exists for this venue — skip silently
            return res.status(200).json({
                success: true,
                synced: false,
                reason: 'No Club Page linked to this venue'
            });
        }

        const clubPage = pages[0];

        // 2. Check if a tournament post already exists for this tournament
        const tournamentId = tournament.id || tournament.name;
        let existingPost = null;

        if (tournament.id) {
            const { data: posts } = await supabase
                .from('social_page_posts')
                .select('id')
                .eq('page_id', clubPage.id)
                .eq('content_type', 'tournament_schedule')
                .filter('metadata->>tournament_id', 'eq', tournament.id)
                .limit(1);

            if (posts && posts.length > 0) {
                existingPost = posts[0];
            }
        }

        const postContent = formatTournamentPost(tournament);
        const postMetadata = {
            tournament_id: tournament.id || null,
            tournament_name: tournament.name,
            tournament_type: tournament.tournament_type,
            buyin_amount: tournament.buyin_amount,
            buyin_fee: tournament.buyin_fee,
            starting_chips: tournament.starting_chips,
            scheduled_start: tournament.scheduled_start,
            guaranteed_pool: tournament.guaranteed_pool,
            status: tournament.status || 'scheduled',
            auto_synced: true,
            synced_at: new Date().toISOString(),
        };

        if (existingPost) {
            // Update existing post
            const { error } = await supabase
                .from('social_page_posts')
                .update({
                    content: postContent,
                    metadata: postMetadata,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existingPost.id);

            if (error) throw error;

            return res.status(200).json({
                success: true,
                synced: true,
                action: 'updated',
                post_id: existingPost.id,
            });
        } else {
            // Create new post
            const { data: newPost, error } = await supabase
                .from('social_page_posts')
                .insert({
                    page_id: clubPage.id,
                    author_id: clubPage.owner_id,
                    content: postContent,
                    content_type: 'tournament_schedule',
                    visibility: 'public',
                    is_pinned: false,
                    is_approved: true,
                    metadata: postMetadata,
                })
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({
                success: true,
                synced: true,
                action: 'created',
                post_id: newPost.id,
            });
        }
    } catch (err) {
        console.error('Tournament Club Page sync error:', err);
        return res.status(500).json({
            error: 'Failed to sync tournament to Club Page',
            details: err.message,
        });
    }
}
