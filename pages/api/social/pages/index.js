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
import { requireAuth } from '../../../../src/lib/auth-middleware';
import { formatSlug, validateSlug } from './check-slug';
import { reportApiError } from '../../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        if (!supabaseUrl || !supabaseServiceKey) return null;
        _supabase = createClient(supabaseUrl, supabaseServiceKey);
    }
    return _supabase;
}

function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60) + '-' + Date.now().toString(36);
}

export default async function handler(req, res) {
  try {
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
          const safeP = (v) => Array.isArray(v) ? v[0] : (v || '');
          const id = safeP(req.query.id) || null;
          const slug = safeP(req.query.slug) || null;
          const page_type = safeP(req.query.page_type);
          const owner_id = safeP(req.query.owner_id);
          const category = safeP(req.query.category);
          const rawSearch = safeP(req.query.search);
          // Sanitize: strip LIKE wildcards, cap at 200 chars
          const search = rawSearch ? rawSearch.slice(0, 200).replace(/[%_\\]/g, (c) => '\\' + c) : null;
          const user_id = safeP(req.query.user_id);
          const followed_only = safeP(req.query.followed_only);
          const linked_venue_id = safeP(req.query.linked_venue_id);
          const limit = Math.min(parseInt(safeP(req.query.limit)) || 20, 100);
          const offset = Math.min(Math.max(parseInt(safeP(req.query.offset)) || 0, 0), 10000);

          // ──────────────────────────────────────────────────────────────
          //  HOME-GAME QUARANTINE (Phase 15)
          //
          //  Home groups own a row in social_pages for internal plumbing
          //  (the /hub/home-games/{slug} SSR page resolves via that row,
          //  and the follow API writes to social_page_followers). But
          //  home groups must NOT appear in any Social Pages directory
          //  surface — they have their own dedicated /hub/home-games/*
          //  UX, and exposing them as generic social pages would let
          //  users discover private home-game listings through the
          //  general social directory.
          //
          //  Every branch below that returns social_pages data now
          //  unconditionally excludes page_type='home_game'.
          //
          //  Callers that specifically want home-game data must use
          //  the dedicated endpoints:
          //    GET /api/public/home-games/{slug}
          //    GET /api/public/home-games/discover
          //
          //  The single-page-by-ID and single-page-by-slug branches
          //  return 404 with a redirect_to hint when the page_id or
          //  slug resolves to a home_game page_type. The list branch
          //  filters them out silently.
          // ──────────────────────────────────────────────────────────────

          // Single page by ID
          if (id) {
              const { data, error } = await getSupabase()
                  .from('social_pages')
                  .select('*')
                  .eq('id', id)
                  .neq('page_type', 'home_game')
                  .maybeSingle();

              if (error || !data) return res.status(404).json({ success: false, error: 'Page not found' });

              // Get owner profile
              let owner = null;
              if (data.owner_id) {
                  const { data: profile } = await getSupabase()
                      .from('profiles')
                      .select('id, username, full_name, avatar_url')
                      .eq('id', data.owner_id)
                      .maybeSingle();
                  owner = profile;
              }

              // Check if user follows
              let is_following = false;
              if (user_id) {
                  const { data: follow } = await getSupabase()
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
              const { data, error } = await getSupabase()
                  .from('social_pages')
                  .select('*')
                  .eq('slug', slug)
                  .neq('page_type', 'home_game')
                  .maybeSingle();

              // #4: Slug history redirect — check if this was an old slug
              if (error || !data) {
                  const { data: historyEntry } = await getSupabase()
                      .from('slug_history')
                      .select('new_slug, page_id')
                      .eq('old_slug', slug)
                      .order('changed_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();

                  if (historyEntry && historyEntry.new_slug) {
                      return res.status(200).json({
                          success: true,
                          redirect: true,
                          new_slug: historyEntry.new_slug,
                      });
                  }
                  return res.status(404).json({ success: false, error: 'Page not found' });
              }

              // #8: Fire-and-forget view count increment
              getSupabase()
                  .rpc('increment_page_views', { page_uuid: data.id })
                  .then(() => {})
                  .catch(e => console.warn('[SocialPages] View increment failed:', e?.message || e));

              // Enrich with owner profile (same as ID lookup)
              let owner = null;
              if (data.owner_id) {
                  const { data: profile } = await getSupabase()
                      .from('profiles')
                      .select('id, username, full_name, avatar_url')
                      .eq('id', data.owner_id)
                      .maybeSingle();
                  owner = profile;
              }

              // Check if user follows
              let is_following = false;
              if (user_id) {
                  const { data: follow } = await getSupabase()
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
              const { data, error } = await getSupabase()
                  .from('social_pages')
                  .select('*')
                  .eq('linked_venue_id', String(linked_venue_id))
                  .limit(parseInt(limit, 10) || 1);

              if (error) {
                  console.warn('[SocialPages] linked_venue_id query error:', error);
                  return res.status(500).json({ success: false, error: 'Database query failed' });
              }
              return res.status(200).json({ success: true, data: data || [] });
          }

          // List pages with filters
          let query = getSupabase()
              .from('social_pages')
              .select('*');

          const include_memberships = safeP(req.query.include_memberships) === 'true';

          // Phase 15: exclude home games from generic directory, except for owner
          if (!owner_id) {
              query = query.neq('page_type', 'home_game');
          }

          // Only filter by is_public when NOT fetching own pages
          if (!owner_id) query = query.eq('is_public', true);

          // If the caller explicitly passes page_type, honor it BUT the
          // neq('home_game') above still applies. page_type='home_game' will
          // produce zero rows — that's intentional. Home-game consumers use
          // /api/public/home-games/discover instead.
          if (page_type) query = query.eq('page_type', page_type);
          
          if (owner_id) {
              if (include_memberships) {
                  // Advanced Identity Lookup: find pages user owns OR is a member of (as player, agent, etc)
                  try {
                      // 1. Get clubs where user is an active member
                      const { data: memberships } = await getSupabase()
                          .from('club_members')
                          .select('club_id')
                          .eq('user_id', owner_id)
                          .eq('status', 'active');
                      
                      const joinedClubIds = (memberships || []).map(m => m.club_id);
                      
                      if (joinedClubIds.length > 0) {
                          // OR logic: (owner_id = userId) OR (linked_entity_type = 'club' AND linked_entity_id IN (...))
                          query = query.or(`owner_id.eq.${owner_id},and(linked_entity_type.eq.club,linked_entity_id.in.(${joinedClubIds.join(',')}))`);
                      } else {
                          query = query.eq('owner_id', owner_id);
                      }
                  } catch (e) {
                      console.warn('[SocialPages] Membership lookup failed:', e);
                      query = query.eq('owner_id', owner_id);
                  }
              } else {
                  query = query.eq('owner_id', owner_id);
              }
          }
          
          if (category && category !== 'all') query = query.eq('category', category);
          if (search) query = query.ilike('name', `%${search}%`);

          // If followed_only, join with followers
          if (followed_only === 'true' && user_id) {
              const { data: followedIds } = await getSupabase()
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
              .range(offset, offset + limit - 1);

          const { data, error, count } = await query;

          if (error) {
              console.warn('[SocialPages] List query error:', error);
              return res.status(500).json({ success: false, error: 'Database query failed' });
          }

          // Check follow status for each page
          let enriched = data || [];

          // Fix relative avatar URLs (e.g. /hub/club-arena/images/...)
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';
          enriched = enriched.map(p => {
              let avatar = p.avatar_url;
              if (avatar && avatar.startsWith('/') && !avatar.startsWith('//')) {
                  avatar = `${siteUrl}${avatar}`;
              }
              return { ...p, avatar_url: avatar };
          });

          // Fetch unread counts if fetching own identities
          if (owner_id && include_memberships && enriched.length > 0) {
              try {
                  const { data: unreadCounts } = await getSupabase().rpc('fn_get_all_identity_unread_counts', {
                      p_user_id: owner_id
                  });
                  
                  if (unreadCounts) {
                      const countMap = {};
                      unreadCounts.forEach(row => {
                          if (row.entity_id) countMap[row.entity_id] = parseInt(row.unread_total) || 0;
                      });
                      
                      enriched = enriched.map(p => ({
                          ...p,
                          unread_count: countMap[p.id] || 0
                      }));
                  }
              } catch (e) {
                  console.warn('[SocialPages] Failed to fetch unread counts:', e);
              }
          }

          if (user_id && enriched.length > 0) {
              const pageIds = enriched.map(p => p.id);
              const { data: follows } = await getSupabase()
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
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          // === Report Action ===
          if (req.body.action === 'report') {
              const { page_id, reason, details } = req.body;
              if (!page_id || !reason) {
                  return res.status(400).json({ success: false, error: 'page_id and reason required' });
              }
              // Insert report into audit log (non-blocking if table doesn't exist)
              try {
                  const { error } = await getSupabase()
                      .from('social_page_reports')
                      .insert({
                          page_id,
                          reporter_id: authUser.id,
                          reason,
                          details: details || '',
                          status: 'pending',
                      });
                  if (error) {
                      // Table may not exist yet — log but don't fail
                      console.warn('[SocialPages] Report insert warning:', error.message);
                  }
              } catch (e) {
                  console.warn('[SocialPages] Report error:', e.message);
              }
              return res.status(200).json({ success: true, message: 'Report submitted' });
          }

          const { name, page_type, description, category, avatar_url, cover_url,
              website, contact_email, phone, location_city, location_state,
              linked_venue_id, is_public, allow_member_posts, require_post_approval,
              metadata, slug: rawSlug } = req.body;
          const owner_id = authUser.id;

          if (!name || !page_type) {
              return res.status(400).json({ success: false, error: 'name and page_type are required' });
          }

          // ── REGULATORY: home_game pages must come through the Club Commander
          // Home Games signup flow. Direct creation here would produce a
          // zombie social page with no underlying commander_home_groups row
          // (and would sidestep the three-entry-port unified-funnel rule).
          // The trg_autocreate_home_group_social_page trigger auto-provisions
          // the social page when a home group is created via the proper path.
          if (page_type === 'home_game') {
              return res.status(400).json({
                  success: false,
                  error: 'Home Game pages are created through Club Commander Home Games signup, not the generic Social Pages creator.',
                  code: 'HOME_GAME_WRONG_ENTRY',
                  redirect: '/commander/register?tier=home_game&from=social_pages&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate'
              });
          }

          // Custom slug: validate if provided, otherwise auto-generate
          let slug;
          if (rawSlug && rawSlug.trim()) {
              slug = formatSlug(rawSlug);
              const validation = validateSlug(slug);
              if (!validation.valid) {
                  return res.status(400).json({ success: false, error: validation.error });
              }
              // Check uniqueness
              const { data: existing } = await getSupabase()
                  .from('social_pages').select('id').eq('slug', slug).maybeSingle();
              if (existing) {
                  return res.status(409).json({ success: false, error: 'This custom URL is already taken' });
              }
          } else {
              slug = generateSlug(name);
          }
          const referralCode = slug.substring(0, 20) + '-' + Math.random().toString(36).substring(2, 6);

          const { data, error } = await getSupabase()
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

          if (error) {
              console.warn('[SocialPages] Insert error:', error);
              return res.status(500).json({ success: false, error: 'Failed to create page' });
          }

          if (!data) return res.status(500).json({ success: false, error: 'Failed to create page' });

          // Auto-follow as owner
          // MEDIUM FIX: Add error check after auto-follow insert
          const { error: followErr } = await getSupabase().from('social_page_followers').insert({
              page_id: data.id,
              user_id: owner_id,
              role: 'owner',
              status: 'approved'
          });
          if (followErr) console.warn('[SocialPages] Auto-follow failed:', followErr.message);

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
                          console.warn(`[geocode] Failed for page ${data.id}: HTTP ${r.status}`);
                          // Report to Sentry so we can track geocoding failures
                          import('../../../../src/lib/sentry').then(({ captureMessage }) => {
                              captureMessage(`Geocoding failed for page ${data.id}`, 'warning', {
                                  tags: { api: 'social-pages', stage: 'geocoding' },
                                  extra: { page_id: data.id, location: locStr, http_status: r.status },
                              });
                          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                      } else {
                          console.debug(`[geocode] Success for page ${data.id}`);
                      }
                  }).catch(e => {
                      console.warn(`[geocode] Error for page ${data.id}:`, e.message);
                      import('../../../../src/lib/sentry').then(({ captureError }) => {
                          captureError(e, {
                              tags: { api: 'social-pages', stage: 'geocoding' },
                              extra: { page_id: data.id, location: locStr },
                          });
                      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                  });
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          return res.status(201).json({ success: true, data });

      } else if (req.method === 'PUT') {
          // Require JWT auth
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { id, ...updates } = req.body;
          const owner_id = authUser.id;
          // Security: never allow client to modify owner
          delete updates.owner_id;

          if (!id) {
              return res.status(400).json({ success: false, error: 'id is required' });
          }

          // Verify ownership and get existing data for change detection
          const { data: existing } = await getSupabase()
              .from('social_pages')
              .select('owner_id, name, slug, avatar_url, cover_url, description, location_city, location_state, page_type, metadata')
              .eq('id', id)
              .maybeSingle();

          if (!existing || existing.owner_id !== owner_id) {
              return res.status(403).json({ success: false, error: 'Not authorized' });
          }

          // Validate custom slug if being updated
          if (updates.slug !== undefined) {
              if (updates.slug && updates.slug.trim()) {
                  updates.slug = formatSlug(updates.slug);
                  const validation = validateSlug(updates.slug);
                  if (!validation.valid) {
                      return res.status(400).json({ success: false, error: validation.error });
                  }
                  // Check uniqueness (exclude this page)
                  if (updates.slug !== existing.slug) {
                      const { data: slugTaken } = await getSupabase()
                          .from('social_pages').select('id').eq('slug', updates.slug).neq('id', id).maybeSingle();
                      if (slugTaken) {
                          return res.status(409).json({ success: false, error: 'This custom URL is already taken' });
                      }
                      // #4: Save old slug to history for redirect support
                      if (existing.slug) {
                          const { error: historyErr } = await getSupabase().from('slug_history').insert({
                              page_id: id,
                              old_slug: existing.slug,
                              new_slug: updates.slug,
                              reason: 'changed',
                          });
                          if (historyErr) console.warn('[SocialPages] Failed to save slug history:', historyErr.message);
                      }
                  }
              } else {
                  // Don't allow setting slug to empty
                  delete updates.slug;
              }
          }

          const { data, error } = await getSupabase()
              .from('social_pages')
              .update({ ...updates, updated_at: new Date().toISOString() })
              .eq('id', id)
              .select()
              .maybeSingle();

          if (error) {
              console.warn('[SocialPages] Update error:', error);
              return res.status(500).json({ success: false, error: 'Failed to update page' });
          }

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
                  if (!r.ok) console.warn(`[AutoPost] Failed ${postType} for page ${id}: HTTP ${r.status}`);
                  else console.debug(`[AutoPost] Created ${postType} post.`);
              }).catch(e => console.warn(`[AutoPost] Error ${postType}:`, e.message));
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
              if (Object.keys(venueUpdates || {}).length > 0) {
                  try {
                      const { error: venueErr } = await getSupabase().from('poker_venues')
                          .update(venueUpdates)
                          .eq('id', data.linked_venue_id);
                      if (venueErr) console.warn('[VenueSync] Failed to sync:', venueErr.message);
                      else console.debug('[VenueSync] Synced venue updates.');
                  } catch (err) {
                      console.warn('[VenueSync] Error:', err.message);
                  }
              }
          }

          return res.status(200).json({ success: true, data });

      } else if (req.method === 'DELETE') {
          // Require JWT auth
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const id = safeQ(req.query.id);

          if (!id) return res.status(400).json({ success: false, error: 'id is required' });

          // Verify ownership via JWT user
          const { data: existing } = await getSupabase()
              .from('social_pages')
              .select('owner_id, slug')
              .eq('id', id)
              .maybeSingle();

          if (!existing || existing.owner_id !== authUser.id) {
              return res.status(403).json({ success: false, error: 'Not authorized — only the page owner can delete' });
          }

          // #4/#10: Save slug to history before deletion (enables cooldown)
          if (existing.slug) {
              const { error: delHistoryErr } = await getSupabase().from('slug_history').insert({
                  page_id: id,
                  old_slug: existing.slug,
                  new_slug: null,
                  reason: 'deleted',
              });
              if (delHistoryErr) console.warn('[SocialPages] Failed to save slug history on delete:', delHistoryErr.message);
          }

          const { error } = await getSupabase()
              .from('social_pages')
              .delete()
              .eq('id', id);

          if (error) {
              console.warn('[SocialPages] Delete error:', error);
              return res.status(500).json({ success: false, error: 'Failed to delete page' });
          }
          return res.status(200).json({ success: true });

      } else {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
