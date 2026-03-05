/**
 * Live Game Detail API
 *
 * GET: Get single live game details
 * POST: Confirm or update a live game report
 * DELETE: Mark a game as expired/ended
 */

import { supabase } from '../../../../src/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CDN cache: fresh for 60s, serve stale up to 300s
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  }

  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ success: false, error: 'Game ID required' });
    }

    if (req.method === 'GET') {
        return handleGet(req, res, id);
    } else if (req.method === 'POST') {
        return handlePost(req, res, id);
    } else if (req.method === 'DELETE') {
        return handleDelete(req, res, id);
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleGet(req, res, id) {
    try {
        const { data: game, error } = await supabaseAdmin
            .from('live_games')
            .select(`
                *,
                venue:poker_venues(id, name, address, city, state, latitude, longitude, phone, website),
                confirmations:live_game_confirmations(
                    id, action, seats_open, waitlist_size, notes, created_at,
                    user:profiles(id, username, avatar_url)
                )
            `)
            .eq('id', id)
            .single();

        if (error || !game) {
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        return res.status(200).json(game);

    } catch (error) {
        console.error('Live game GET error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function handlePost(req, res, id) {
    try {
        // Get user from auth header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        const { action, seats_open, waitlist_size, notes } = req.body;

        // Validate action
        const validActions = ['confirm', 'update', 'expired', 'incorrect'];
        if (!action || !validActions.includes(action)) {
            return res.status(400).json({
                success: false, error: 'Invalid action',
                valid: validActions
            });
        }

        // Get current game
        const { data: game, error: gameError } = await supabaseAdmin
            .from('live_games')
            .select('*')
            .eq('id', id)
            .single();

        if (gameError || !game) {
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        // Log the confirmation
        const { error: confirmError } = await supabaseAdmin
            .from('live_game_confirmations')
            .insert({
                live_game_id: id,
                user_id: user.id,
                action,
                seats_open: seats_open ?? null,
                waitlist_size: waitlist_size ?? null,
                notes: notes || null
            });

        if (confirmError) {
            console.error('Error logging confirmation:', confirmError);
            return res.status(500).json({ success: false, error: 'Failed to log confirmation' });
        }

        // Update game based on action
        let updateData = {
            last_confirmed_at: new Date().toISOString()
        };

        if (action === 'confirm') {
            updateData.confirmation_count = game.confirmation_count + 1;
            updateData.expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        } else if (action === 'update') {
            updateData.confirmation_count = game.confirmation_count + 1;
            updateData.expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
            if (seats_open !== undefined) updateData.seats_open = seats_open;
            if (waitlist_size !== undefined) updateData.waitlist_size = waitlist_size;
            if (notes) updateData.notes = notes;
        } else if (action === 'expired' || action === 'incorrect') {
            // If multiple people mark as expired/incorrect, deactivate
            const { count } = await supabaseAdmin
                .from('live_game_confirmations')
                .select('*', { count: 'exact', head: true })
                .eq('live_game_id', id)
                .in('action', ['expired', 'incorrect'])
                    .limit(100);

            if (count >= 2) {
                updateData.is_active = false;
            }
        }

        const { error: updateError } = await supabaseAdmin
            .from('live_games')
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            console.error('Error updating game:', updateError);
        }

        return res.status(200).json({
            success: true,
            action,
            message: `Game ${action} recorded`
        });

    } catch (error) {
        console.error('Live game POST error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function handleDelete(req, res, id) {
    try {
        // Get user from auth header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // Check if user is the reporter
        const { data: game, error: gameError } = await supabaseAdmin
            .from('live_games')
            .select('reported_by')
            .eq('id', id)
            .single();

        if (gameError || !game) {
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        if (game.reported_by !== user.id) {
            return res.status(403).json({ success: false, error: 'Only the reporter can delete this game' });
        }

        // Mark as inactive instead of deleting
        const { error: updateError } = await supabaseAdmin
            .from('live_games')
            .update({ is_active: false })
            .eq('id', id);

        if (updateError) {
            console.error('Error deleting game:', updateError);
            return res.status(500).json({ success: false, error: 'Failed to delete game' });
        }

        return res.status(200).json({
            success: true,
            message: 'Game marked as ended'
        });

    } catch (error) {
        console.error('Live game DELETE error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
