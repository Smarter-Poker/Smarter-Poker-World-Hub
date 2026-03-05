/**
 * Sync Tournament to Club Page API
 * When a tournament is created/updated/cancelled in Commander,
 * auto-post or update the schedule on the venue's Club Page
 *
 * POST /api/commander/sync-tournament-to-club
 * Body: { venue_id, tournament }
 * Auth: x-staff-session header (verified via guardStaff)
 */
import { createClient } from '@supabase/supabase-js';
import { guardStaff } from '../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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

    // Format the tournament type label properly
    const typeLabels = {
        freezeout: 'Freezeout',
        rebuy: 'Rebuy',
        bounty: 'Bounty',
        pko: 'Progressive Knockout',
        satellite: 'Satellite',
        shootout: 'Shootout',
        turbo: 'Turbo',
        hyper: 'Hyper-Turbo',
    };
    const formatLabel = typeLabels[tournament.tournament_type] ||
        (tournament.tournament_type?.charAt(0).toUpperCase() + tournament.tournament_type?.slice(1)) ||
        'Freezeout';

    let lines = [
        `TOURNAMENT: ${tournament.name}`,
        `Date: ${dateStr}`,
        `Time: ${timeStr}`,
        `Buy-in: ${buyinStr}`,
        `Starting Stack: ${chipsStr} chips`,
        `Format: ${formatLabel}`,
    ];

    if (tournament.guaranteed_pool) {
        lines.push(`Guaranteed: $${tournament.guaranteed_pool.toLocaleString()}`);
    }

    if (tournament.tournament_type === 'pko') {
        lines.push(`Progressive KO: Bounties grow as players are eliminated`);
    }

    if (tournament.status === 'cancelled') {
        lines.unshift('[CANCELLED]');
    }

    return lines.join('\n');
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Auth guard — require staff authentication
    const staff = await guardStaff(req, res);
    if (!staff) return;

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { venue_id, tournament } = req.body;

    if (!venue_id || !tournament) {
        return res.status(400).json({ success: false, error: 'venue_id and tournament are required' });
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
        //    Uses content_type 'event' (matches DB constraint) + metadata.tournament_id
        let existingPost = null;

        if (tournament.id) {
            const { data: posts } = await supabase
                .from('social_page_posts')
                .select('id')
                .eq('page_id', clubPage.id)
                .eq('content_type', 'event')
                .filter('metadata->>tournament_id', 'eq', String(tournament.id))
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
            bounty_amount: tournament.bounty_amount || null,
            is_pko: tournament.tournament_type === 'pko',
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
                    content_type: 'event',
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
            success: false, error: 'Failed to sync tournament to Club Page',
            details: err.message,
        });
    }
}
