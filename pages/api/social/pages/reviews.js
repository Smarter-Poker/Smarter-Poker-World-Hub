/**
 * Social Pages Reviews API
 * GET  /api/social/pages/reviews?page_id=UUID - Get reviews for a social page
 * POST /api/social/pages/reviews - Submit a new review (auth required)
 */
import { createClient } from '@supabase/supabase-js';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    try {
        if (req.method === 'GET') {
            const { page_id, limit = 20, offset = 0, sort = 'recent' } = req.query;

            if (!page_id) {
                return res.status(400).json({ success: false, error: 'page_id required' });
            }

            let query = supabase
                .from('social_page_reviews')
                .select('id, page_id, reviewer_id, overall_rating, title, content, helpful_count, created_at', { count: 'exact' })
                .eq('page_id', page_id)
                .eq('is_published', true);

            if (sort === 'helpful') {
                query = query.order('helpful_count', { ascending: false });
            } else if (sort === 'rating_high') {
                query = query.order('overall_rating', { ascending: false });
            } else if (sort === 'rating_low') {
                query = query.order('overall_rating', { ascending: true });
            } else {
                query = query.order('created_at', { ascending: false });
            }

            const { data: reviews, error, count } = await query
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

            if (error) throw error;

            // Enrich with reviewer profiles
            const enriched = await Promise.all((reviews || []).map(async (r) => {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name, username, avatar_url')
                    .eq('id', r.reviewer_id)
                    .maybeSingle();

                return {
                    ...r,
                    reviewer: profile ? {
                        id: r.reviewer_id,
                        display_name: profile.display_name || profile.username || 'Anonymous',
                        avatar_url: profile.avatar_url
                    } : { id: r.reviewer_id, display_name: 'Anonymous', avatar_url: null }
                };
            }));

            return res.status(200).json({
                success: true,
                data: { reviews: enriched, total: count || 0, limit: parseInt(limit), offset: parseInt(offset) }
            });

        } else if (req.method === 'POST') {
            // Require JWT auth
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
            const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
            if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

            const { page_id, overall_rating, title, content } = req.body;
            const reviewer_id = authUser.id;

            if (!page_id || !overall_rating) {
                return res.status(400).json({ success: false, error: 'page_id and overall_rating are required' });
            }

            if (overall_rating < 1 || overall_rating > 5) {
                return res.status(400).json({ success: false, error: 'overall_rating must be between 1 and 5' });
            }

            // Check if user already reviewed this page
            const { data: existing } = await supabase
                .from('social_page_reviews')
                .select('id')
                .eq('page_id', page_id)
                .eq('reviewer_id', reviewer_id)
                .maybeSingle();

            if (existing) {
                // Update existing review
                const { data: updated, error } = await supabase
                    .from('social_page_reviews')
                    .update({
                        overall_rating,
                        title: title || null,
                        content: content || null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();

                if (error) throw error;
                return res.status(200).json({ success: true, data: updated, updated: true });
            }

            // Insert new review
            const { data: review, error } = await supabase
                .from('social_page_reviews')
                .insert({
                    page_id,
                    reviewer_id,
                    overall_rating,
                    title: title || null,
                    content: content || null
                })
                .select()
                .single();

            if (error) throw error;
            return res.status(201).json({ success: true, data: review });

        } else {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Social pages reviews API error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}
