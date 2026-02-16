/**
 * Social Pages API - CRUD for social media pages
 *
 * GET  /api/social/pages              - List pages (with filters)
 * GET  /api/social/pages?id=<id>      - Get single page
 * GET  /api/social/pages?slug=<slug>  - Get page by slug
 * POST /api/social/pages              - Create page
 * PUT  /api/social/pages              - Update page
 * DELETE /api/social/pages?id=<id>    - Delete page
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
    if (!supabaseUrl || !supabaseServiceKey) return null;
    return createClient(supabaseUrl, supabaseServiceKey);
}

function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60) + '-' + Date.now().toString(36);
}

export default async function handler(req, res) {
    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    if (req.method === 'GET') {
        const { id, slug, page_type, owner_id, category, search, user_id, followed_only, linked_venue_id, limit = '20', offset = '0' } = req.query;

        // Single page by ID
        if (id) {
            const { data, error } = await supabase
                .from('social_pages')
                .select('*')
                .eq('id', id)
                .single();

            if (error) return res.status(404).json({ error: 'Page not found' });

            // Get owner profile
            let owner = null;
            if (data.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .eq('id', data.owner_id)
                    .single();
                owner = profile;
            }

            // Check if user follows
            let is_following = false;
            if (user_id) {
                const { data: follow } = await supabase
                    .from('social_page_followers')
                    .select('id')
                    .eq('page_id', id)
                    .eq('user_id', user_id)
                    .maybeSingle();
                is_following = !!follow;
            }

            return res.status(200).json({
                success: true,
                data: { ...data, owner, is_following }
            });
        }

        // Single page by slug
        if (slug) {
            const { data, error } = await supabase
                .from('social_pages')
                .select('*')
                .eq('slug', slug)
                .single();

            if (error) return res.status(404).json({ error: 'Page not found' });

            // Enrich with owner profile (same as ID lookup)
            let owner = null;
            if (data.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .eq('id', data.owner_id)
                    .single();
                owner = profile;
            }

            // Check if user follows
            let is_following = false;
            if (user_id) {
                const { data: follow } = await supabase
                    .from('social_page_followers')
                    .select('id')
                    .eq('page_id', data.id)
                    .eq('user_id', user_id)
                    .maybeSingle();
                is_following = !!follow;
            }

            return res.status(200).json({
                success: true,
                data: { ...data, owner, is_following }
            });
        }

        // Lookup by linked venue ID (returns matching social page for a venue)
        if (linked_venue_id) {
            const { data, error } = await supabase
                .from('social_pages')
                .select('*')
                .eq('linked_venue_id', String(linked_venue_id))
                .limit(parseInt(limit, 10) || 1);

            if (error) return res.status(500).json({ error: error.message });
            return res.status(200).json({ success: true, data: data || [] });
        }

        // List pages with filters
        let query = supabase
            .from('social_pages')
            .select('*');

        // Only filter by is_public when NOT fetching own pages
        if (!owner_id) query = query.eq('is_public', true);

        if (page_type) query = query.eq('page_type', page_type);
        if (owner_id) query = query.eq('owner_id', owner_id);
        if (category && category !== 'all') query = query.eq('category', category);
        if (search) query = query.ilike('name', `%${search}%`);

        // If followed_only, join with followers
        if (followed_only === 'true' && user_id) {
            const { data: followedIds } = await supabase
                .from('social_page_followers')
                .select('page_id')
                .eq('user_id', user_id);

            const ids = (followedIds || []).map(f => f.page_id);
            if (ids.length === 0) {
                return res.status(200).json({ success: true, data: [], total: 0 });
            }
            query = query.in('id', ids);
        }

        query = query
            .order('follower_count', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        const { data, error, count } = await query;

        if (error) return res.status(500).json({ error: error.message });

        // Check follow status for each page
        let enriched = data || [];
        if (user_id && enriched.length > 0) {
            const pageIds = enriched.map(p => p.id);
            const { data: follows } = await supabase
                .from('social_page_followers')
                .select('page_id')
                .eq('user_id', user_id)
                .in('page_id', pageIds);

            const followSet = new Set((follows || []).map(f => f.page_id));
            enriched = enriched.map(p => ({
                ...p,
                is_following: followSet.has(p.id)
            }));
        }

        return res.status(200).json({ success: true, data: enriched, total: count });

    } else if (req.method === 'POST') {
        const { name, page_type, description, category, avatar_url, cover_url,
            website, contact_email, phone, location_city, location_state,
            linked_venue_id, is_public, allow_member_posts, require_post_approval,
            metadata, owner_id } = req.body;

        if (!name || !page_type) {
            return res.status(400).json({ error: 'name and page_type are required' });
        }

        if (!owner_id) {
            return res.status(400).json({ error: 'owner_id is required' });
        }

        const slug = generateSlug(name);
        const referralCode = slug.substring(0, 20) + '-' + Math.random().toString(36).substring(2, 6);

        const { data, error } = await supabase
            .from('social_pages')
            .insert({
                owner_id,
                name,
                slug,
                page_type,
                description: description || '',
                category: category || 'general',
                avatar_url,
                cover_url,
                website,
                contact_email,
                phone,
                location_city,
                location_state,
                linked_venue_id,
                is_public: is_public !== false,
                allow_member_posts: allow_member_posts !== false,
                require_post_approval: require_post_approval || false,
                metadata: { ...(metadata || {}), referral_code: referralCode }
            })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });

        // Auto-follow as owner
        await supabase.from('social_page_followers').insert({
            page_id: data.id,
            user_id: owner_id,
            role: 'owner',
            status: 'approved'
        });

        // Auto-geocode primary location in background (non-blocking)
        if (data.location_city) {
            const locStr = data.location_city + (data.location_state ? ', ' + data.location_state : '');
            try {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
                    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
                fetch(`${baseUrl}/api/social/geocode-locations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page_id: data.id, locations: [locStr] }),
                }).then(r => {
                    if (!r.ok) {
                        console.error(`[geocode] Failed for page ${data.id}: HTTP ${r.status}`);
                        // Report to Sentry so we can track geocoding failures
                        import('../../../../src/lib/sentry').then(({ captureMessage }) => {
                            captureMessage(`Geocoding failed for page ${data.id}`, 'warning', {
                                tags: { api: 'social-pages', stage: 'geocoding' },
                                extra: { page_id: data.id, location: locStr, http_status: r.status },
                            });
                        }).catch(() => { });
                    } else {
                        console.log(`[geocode] Success for page ${data.id}: ${locStr}`);
                    }
                }).catch(e => {
                    console.error(`[geocode] Error for page ${data.id}:`, e.message);
                    import('../../../../src/lib/sentry').then(({ captureError }) => {
                        captureError(e, {
                            tags: { api: 'social-pages', stage: 'geocoding' },
                            extra: { page_id: data.id, location: locStr },
                        });
                    }).catch(() => { });
                });
            } catch (e) { /* non-critical */ }
        }

        return res.status(201).json({ success: true, data });

    } else if (req.method === 'PUT') {
        const { id, owner_id, ...updates } = req.body;

        if (!id || !owner_id) {
            return res.status(400).json({ error: 'id and owner_id are required' });
        }

        // Verify ownership and get existing data for change detection
        const { data: existing } = await supabase
            .from('social_pages')
            .select('owner_id, name, avatar_url, cover_url, description, location_city, location_state, page_type, metadata')
            .eq('id', id)
            .single();

        if (!existing || existing.owner_id !== owner_id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { data, error } = await supabase
            .from('social_pages')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });

        // Auto-post for profile changes (non-blocking, fire-and-forget)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const pageName = data.name || existing.name || 'Page';
        const entityType = existing.page_type === 'home_game' ? 'home_game' : 'club';

        const createAutoPost = (postType, mediaUrl, location) => {
            fetch(`${baseUrl}/api/social/auto-post`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: owner_id,
                    post_type: postType,
                    media_url: mediaUrl || null,
                    entity_name: pageName,
                    entity_type: entityType,
                    page_id: id,
                    location: location || null
                }),
            }).then(r => {
                if (!r.ok) console.error(`[AutoPost] Failed ${postType} for page ${id}: HTTP ${r.status}`);
                else console.log(`[AutoPost] Created ${postType} for page "${pageName}"`);
            }).catch(e => console.error(`[AutoPost] Error ${postType}:`, e.message));
        };

        // Detect changes and trigger auto-posts
        if (updates.avatar_url && updates.avatar_url !== existing.avatar_url) {
            createAutoPost('profile_pic_update', updates.avatar_url);
        }
        if (updates.cover_url && updates.cover_url !== existing.cover_url) {
            createAutoPost('cover_photo_update', updates.cover_url);
        }
        // Also detect cover photo changes stored in metadata.cover_photo_url
        // (ClubPageDashboard saves cover photos to metadata, not cover_url)
        // Only fire if cover_url auto-post didn't already trigger above
        else if (updates.metadata?.cover_photo_url &&
            updates.metadata.cover_photo_url !== (existing.metadata?.cover_photo_url || null)) {
            createAutoPost('cover_photo_update', updates.metadata.cover_photo_url);
        }
        if (updates.description !== undefined && updates.description !== existing.description) {
            createAutoPost('story_update');
        }
        if ((updates.location_city && updates.location_city !== existing.location_city) ||
            (updates.location_state && updates.location_state !== existing.location_state)) {
            const city = updates.location_city || existing.location_city || '';
            const state = updates.location_state || existing.location_state || '';
            const newLoc = city + (state ? ', ' + state : '');
            createAutoPost('location_update', null, newLoc.trim());
        }

        return res.status(200).json({ success: true, data });

    } else if (req.method === 'DELETE') {
        const { id } = req.query;
        const { owner_id } = req.body || {};

        if (!id) return res.status(400).json({ error: 'id is required' });

        // Verify ownership
        const { data: existing } = await supabase
            .from('social_pages')
            .select('owner_id')
            .eq('id', id)
            .single();

        if (!existing || (owner_id && existing.owner_id !== owner_id)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { error } = await supabase
            .from('social_pages')
            .delete()
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });

    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
