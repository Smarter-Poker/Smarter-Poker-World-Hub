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
import { createClient } from '../../../../src/lib/supabaseServerClient';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../../src/lib/serverAuth';

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
    // CDN cache: fresh for 60s, serve stale up to 300s
    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    if (req.method === 'GET') {
        const { id, slug, page_type, owner_id, category, search, user_id, followed_only, linked_venue_id, limit = '20', offset = '0' } = req.query;

        // Single page by ID
        if (id) {
            const { data, error } = await supabase
                .from('social_pages')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error || !data) return res.status(404).json({ success: false, error: 'Page not found' });

            // Get owner profile
            let owner = null;
            if (data.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .eq('id', data.owner_id)
                    .maybeSingle();
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
                .maybeSingle();

            if (error || !data) return res.status(404).json({ success: false, error: 'Page not found' });

            // Enrich with owner profile (same as ID lookup)
            let owner = null;
            if (data.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .eq('id', data.owner_id)
                    .maybeSingle();
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

            if (error) return res.status(500).json({ success: false, error: error.message });
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
                .eq('user_id', user_id)
                .limit(100);

            const ids = (followedIds || []).map(f => f.page_id);
            if (ids.length === 0) {
                return res.status(200).json({ success: true, data: [], total: 0 });
            }
            query = query.in('id', ids)
                .limit(100);
        }

        query = query
            .order('follower_count', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        const { data, error, count } = await query;

        if (error) return res.status(500).json({ success: false, error: error.message });

        // Check follow status for each page
        let enriched = data || [];
        if (user_id && enriched.length > 0) {
            const pageIds = enriched.map(p => p.id);
            const { data: follows } = await supabase
                .from('social_page_followers')
                .select('page_id')
                .eq('user_id', user_id)
                .in('page_id', pageIds)
                .limit(100);

            const followSet = new Set((follows || []).map(f => f.page_id));
            enriched = enriched.map(p => ({
                ...p,
                is_following: followSet.has(p.id)
            }));
        }

        return res.status(200).json({ success: true, data: enriched, total: count });

    } else if (req.method === 'POST') {
        // Require JWT auth
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { name, page_type, description, category, avatar_url, cover_url,
            website, contact_email, phone, location_city, location_state,
            linked_venue_id, is_public, allow_member_posts, require_post_approval,
            metadata } = req.body;
        const owner_id = authUser.id;

        if (!name || !page_type) {
            return res.status(400).json({ success: false, error: 'name and page_type are required' });
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
            .maybeSingle();

        if (error) return res.status(500).json({ success: false, error: error.message });

        if (!data) return res.status(500).json({ success: false, error: 'Failed to create page' });

        // Auto-follow as owner
        // MEDIUM FIX: Add error check after auto-follow insert
        const { error: followErr } = await supabase.from('social_page_followers').insert({
            page_id: data.id,
            user_id: owner_id,
            role: 'owner',
            status: 'approved'
        });
        if (followErr) console.error('[SocialPages] Auto-follow failed:', followErr.message);

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
        // Require JWT auth
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { id, ...updates } = req.body;
        const owner_id = authUser.id;

        if (!id) {
            return res.status(400).json({ success: false, error: 'id is required' });
        }

        // Verify ownership and get existing data for change detection
        const { data: existing } = await supabase
            .from('social_pages')
            .select('owner_id, name, avatar_url, cover_url, description, location_city, location_state, page_type, metadata')
            .eq('id', id)
            .maybeSingle();

        if (!existing || existing.owner_id !== owner_id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const { data, error } = await supabase
            .from('social_pages')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error) return res.status(500).json({ success: false, error: error.message });

        // Auto-post for profile changes (non-blocking, fire-and-forget)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const pageName = data.name || existing.name || 'Page';
        const entityType = existing.page_type === 'home_game' ? 'home_game' : 'club';

        const createAutoPost = (postType, mediaUrl, location) => {
            fetch(`${baseUrl}/api/social/auto-post`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
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

        // ── Venue Auto-Sync: push Club Page changes back to poker_venues ──
        if (data.linked_venue_id) {
            const venueUpdates = {};
            if (updates.name && updates.name !== existing.name) venueUpdates.name = updates.name;
            if (updates.phone !== undefined) venueUpdates.phone = updates.phone;
            if (updates.metadata?.address) venueUpdates.address = updates.metadata.address;
            if (updates.location_city) venueUpdates.city = updates.location_city;
            if (updates.location_state) venueUpdates.state = updates.location_state;
            if (Object.keys(venueUpdates).length > 0) {
                supabase.from('poker_venues')
                    .update(venueUpdates)
                    .eq('id', data.linked_venue_id)
                    .then(({ error: venueErr }) => {
                        if (venueErr) console.error('[VenueSync] Failed to sync:', venueErr.message);
                        else console.log('[VenueSync] Synced venue', data.linked_venue_id, ':', Object.keys(venueUpdates).join(', '));
                    });
            }
        }

        return res.status(200).json({ success: true, data });

    } else if (req.method === 'DELETE') {
        // Require JWT auth
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { id } = req.query;

        if (!id) return res.status(400).json({ success: false, error: 'id is required' });

        // Verify ownership via JWT user
        const { data: existing } = await supabase
            .from('social_pages')
            .select('owner_id')
            .eq('id', id)
            .maybeSingle();

        if (!existing || existing.owner_id !== authUser.id) {
            return res.status(403).json({ success: false, error: 'Not authorized — only the page owner can delete' });
        }

        const { error } = await supabase
            .from('social_pages')
            .delete()
            .eq('id', id);

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true });

    } else {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
}
