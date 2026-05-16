/**
 * 🌐 SOCIAL SERVICE — SUPABASE API LAYER
 * src/app/social/SocialService.js
 * 
 * Backend API interactions for social features with optimistic updates.
 */

import { createPost, createComment, createAuthor } from './social-types';
import { claimReward } from '../lib/claimReward';
import { busEmit } from '../engine/EventBus';
import { getAuthUser, getAccessToken, getFreshAccessToken } from '../lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 SOCIAL SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class SocialService {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.realtimeChannel = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 📰 FEED OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Fetch social feed - tries RPC first for rich author data, falls back to direct query
     * @param {Object} options - Feed options
     * @returns {Promise<{ posts: SocialPost[], hasMore: boolean }>}
     */
    async getFeed({ userId, filter = 'recent', limit = 20, offset = 0 }) {
        try {
            // 1. Try RPC first
            const { data: rpcData, error: rpcError } = await this.supabase.rpc('fn_get_social_feed', {
                p_user_id: userId || null,
                p_limit: limit + 1,
                p_offset: offset,
                p_filter: filter
            });

            if (rpcError) throw rpcError;

            if (rpcData) {
                const hasMore = rpcData.length > limit;
                const posts = rpcData.slice(0, limit).map(row => createPost({
                    post_id: row.post_id,
                    author_id: row.author_id,
                    author_username: row.author_username,
                    author_full_name: row.author_full_name,
                    author_display_name_preference: row.author_display_name_preference,
                    author_avatar: row.author_avatar,
                    author_level: row.author_level,
                    content: row.content,
                    content_type: row.content_type,
                    media_urls: row.media_urls,
                    thumbnail_url: row.thumbnail_url || null,  // BUG FIX (SS-1): RPC now returns this
                    metadata: row.metadata || null,            // BUG FIX (SS-1): RPC now returns this
                    like_count: row.like_count,
                    comment_count: row.comment_count,
                    share_count: row.share_count,
                    is_liked: row.is_liked,
                    created_at: row.created_at
                }));
                return { posts, hasMore };
            }
        } catch (err) {
            console.warn('V2 Feed RPC failed, trying Direct Fallback:', err.message);
        }

        try {
            // Fallback: Direct query legacy

            console.warn('RPC fallback: using direct query for feed');
            const { data, error } = await this.supabase
                .from('social_posts')
                .select('*')
                .or('visibility.eq.public,visibility.is.null')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit);

            if (error) throw error;

            const hasMore = data.length > limit;
            const posts = data.slice(0, limit).map(row => createPost({
                ...row,
                post_id: row.id,
                author_username: 'Player',
                author_avatar: null,
                author_level: 1,
                is_liked: false
            }));

            return { posts, hasMore };
        } catch (error) {
            console.warn('Feed fetch error:', error);
            throw error;
        }
    }

    /**
     * Fetch single post with details
     * @param {string} postId - Post UUID
     * @returns {Promise<SocialPost>}
     */
    async getPost(postId) {
        try {
            const { data, error } = await this.supabase
                .from('social_posts')
                .select(`
          *,
          author:user_dna_profiles!author_id (
            user_id,
            username,
            full_name,
            display_name_preference,
            avatar_url,
            current_level,
            tier_id,
            is_verified
          )
        `)
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (!data) return null; // Post not found — guard against null crash

            return createPost(data, createAuthor(data.author));
        } catch (error) {
            console.warn('Post fetch error:', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ✍️ POST OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create new post
     * @param {Object} postData - Post data
     * @param {boolean} postData.autoStory - If true, also create a story (default: true)
     * @returns {Promise<SocialPost>}
     */
    async createPost({ authorId, content, contentType = 'text', mediaUrls = [], thumbnailUrl = null, visibility = 'public', achievementData = null, autoStory = true }) {
        try {
            console.debug('📝 Creating post:', { authorId, content: content?.substring(0, 50), contentType, autoStory });

            let postId = null;
            let postResult = null;

            // 1. Try V2 RPC first (Bypasses "ambiguous column" triggers)
            const { data: rpcData, error: rpcError } = await this.supabase.rpc('fn_create_social_post', {
                p_author_id: authorId,
                p_content: content,
                p_content_type: contentType,
                p_media_urls: mediaUrls,
                p_thumbnail_url: thumbnailUrl || null,  // BUG FIX (SS-2): was silently dropped
                p_visibility: visibility,
                p_achievement_data: achievementData
            });

            // BUG FIX (sweep 3 audit): fn_create_social_post wraps its body
            // in EXCEPTION WHEN OTHERS and returns {success:false, error:SQLERRM}
            // on internal failures (RLS, constraint, disk full, etc.). Previously
            // the check was just `if (!rpcError && rpcData)` — but rpcData is
            // truthy even when {success:false}, so a failed insert was silently
            // treated as a success and we returned a malformed post with
            // postId=undefined. Now we explicitly require both success:true AND
            // a returned id; otherwise we drop into the direct-insert fallback.
            if (!rpcError && rpcData?.success === true && rpcData?.id) {
                console.debug('✅ Post created via RPC:', rpcData.id);
                postId = rpcData.id;
                postResult = createPost({
                    ...rpcData,
                    post_id: rpcData.id,
                    // fn_create_social_post only returns {success, id} — manually include
                    // fields we already have in scope so the immediate feed card is correct.
                    thumbnail_url: thumbnailUrl || null,
                    content_type: contentType,
                    media_urls: mediaUrls,
                    author_username: 'You',
                    author_avatar: null,
                    author_level: 1,
                    is_liked: false
                });
            } else if (rpcError) {
                console.warn('RPC create failed (Supabase error), falling back to direct insert', rpcError);
            } else if (rpcData && rpcData.success === false) {
                console.warn('RPC create returned success:false, falling back to direct insert. SQL error:', rpcData.error);
            }

            // Fallback (Legacy) - only if RPC failed
            if (!postResult) {
                const { data, error } = await this.supabase
                    .from('social_posts')
                    .insert({
                        author_id: authorId,
                        content,
                        content_type: contentType,
                        media_urls: mediaUrls,
                        thumbnail_url: thumbnailUrl || null,
                        visibility,
                        achievement_data: achievementData
                    })
                    .select('*')
                    .maybeSingle();

                if (error) {
                    console.warn('❌ Post insert error:', error);
                    throw error;
                }

                if (!data) {
                    throw new Error('Post created but data not returned');
                }

                console.debug('✅ Post created (Direct):', data.id);
                postId = data.id;

                // Return simplified post object
                postResult = createPost({
                    ...data,
                    author_id: authorId,
                    author_username: 'You',
                    author_avatar: null,
                    author_level: 1
                });
            }

            // 2. AUTO-STORY: Also add to user's story feed (if enabled)
            if (autoStory && visibility === 'public') {
                try {
                    // Get first media URL if available
                    const mediaUrl = mediaUrls?.[0] || null;
                    // Use the contentType already computed by the caller — avoids fragile URL-regex re-detection
                    // contentType is 'video', 'image', or 'text'; map to story media_type values
                    const storyMediaType = contentType === 'video' ? 'video' : contentType === 'image' ? 'image' : null;

                    // Create story using RPC function
                    const { error: storyError } = await this.supabase.rpc('fn_create_story', {
                        p_user_id: authorId,
                        p_content: content?.substring(0, 200) || '', // Story content limit
                        p_media_url: mediaUrl,
                        p_media_type: mediaUrl ? storyMediaType : null,
                        p_background_color: null,
                        p_link_url: null
                    });

                    if (storyError) {
                        console.warn('⚠️ Auto-story creation failed:', storyError.message);
                    } else {
                        console.debug('✅ Auto-story created for post');
                    }
                } catch (storyErr) {
                    console.warn('⚠️ Auto-story error:', storyErr.message);
                    // Don't fail the post creation if story fails
                }
            }

            return postResult;
        } catch (error) {
            console.warn('Post creation error:', error);
            throw error;
        }
    }

    /**
     * Update post
     * @param {string} postId - Post UUID
     * @param {Object} updates - Fields to update
     * @returns {Promise<SocialPost>}
     */
    async updatePost(postId, updates) {
        try {
            const { data, error } = await this.supabase
                .from('social_posts')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', postId)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('Post not found or update blocked by RLS');

            return createPost(data);
        } catch (error) {
            console.warn('Post update error:', error);
            throw error;
        }
    }

    /**
     * Delete post (hard delete)
     * @param {string} postId - Post UUID
     * @returns {Promise<boolean>}
     */
    async deletePost(postId) {
        try {
            // Defense in depth: Check for associated live stream BEFORE deleting the post
            // (in case ON DELETE CASCADE removes the stream record)
            let streamInfo = null;
            try {
                const { data } = await this.supabase
                    .from('live_streams')
                    .select('id')
                    .eq('feed_post_id', postId)
                    .maybeSingle();
                streamInfo = data;
            } catch (e) {
                console.warn('[SocialService] Stream check failed:', e?.message || e);
            }

            // ATOMIC DELETE with .select() to verify RLS permitted the deletion
            const { data: deletedPost, error } = await this.supabase
                .from('social_posts')
                .delete()
                .eq('id', postId)
                .select('id')
                .maybeSingle();

            if (error) throw error;
            if (!deletedPost) throw new Error('Not authorized to delete this post or post not found');

            // POST-DELETE CLEANUP: Only execute if we successfully deleted the post
            try {
                const { error: err_social_reels_fasl4 } = await this.supabase.from('social_reels').delete().eq('source_post_id', postId);
                if (err_social_reels_fasl4) console.warn('[Supabase] Silent mutation failed in social_reels:', err_social_reels_fasl4.message);
            } catch (e) {
                console.warn('[SocialService] Reel cleanup after post delete failed:', e?.message || e);
            }

            if (streamInfo) {
                try {
                    const token = typeof getFreshAccessToken === 'function' ? await getFreshAccessToken() : getAccessToken();
                    fetch('/api/live/end-stream', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({
                            stream_id: streamInfo.id,
                            action: 'delete',
                            deleteReason: 'post_deleted_by_user',
                        }),
                    }).catch(e => console.warn('[SocialService] End-stream API call failed:', e));
                } catch (e) {
                    console.warn('[SocialService] Stream cleanup failed:', e?.message || e);
                }
            }

            return true;
        } catch (error) {
            console.warn('Post deletion error:', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 💫 INTERACTION OPERATIONS (OPTIMISTIC UPDATES)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Toggle like/reaction on post — handles add, remove, AND swap
     * @param {string} postId - Post UUID
     * @param {string} userId - User UUID
     * @param {string} interactionType - Interaction type (like, love, haha, wow, sad, fire)
     * @returns {Promise<{ added: boolean, type: string }>}
     */
    async toggleReaction(postId, userId, interactionType = 'like') {
        try {
            // Check if ANY reaction by this user on this post already exists (any type)
            // Use .limit(1) instead of .maybeSingle() — legacy data may have multiple rows
            const { data: rows } = await this.supabase
                .from('social_likes')
                .select('id, reaction_type')
                .eq('post_id', postId)
                .eq('user_id', userId)
                .limit(1);

            const existing = rows?.[0] || null;

            if (existing) {
                if (existing.reaction_type === interactionType) {
                    // SAME type → toggle OFF (remove all duplicates)
                    const { error } = await this.supabase
                        .from('social_likes')
                        .delete()
                        .eq('post_id', postId)
                        .eq('user_id', userId);
                    if (error) throw error;
                    return { added: false, type: interactionType };
                } else {
                    // DIFFERENT type → SWAP (delete all old, insert new)
                    const { error: delErr } = await this.supabase
                        .from('social_likes')
                        .delete()
                        .eq('post_id', postId)
                        .eq('user_id', userId);
                    if (delErr) throw delErr;

                    const { error: insErr } = await this.supabase
                        .from('social_likes')
                        .insert({
                            post_id: postId,
                            user_id: userId,
                            reaction_type: interactionType
                        });
                    if (insErr) throw insErr;

                    // Swap = still liked, just different type. Count doesn't change.
                    return { added: null, type: interactionType };
                }
            } else {
                // NO existing reaction → ADD new
                const { error } = await this.supabase
                    .from('social_likes')
                    .insert({
                        post_id: postId,
                        user_id: userId,
                        reaction_type: interactionType
                    });
                if (error) throw error;

                // Award reaction diamonds (fire-and-forget, 2💎 max 10/day)
                if (userId) {
                    claimReward('/api/rewards/reaction', { userId, postId, interactionType }, 'Liked a Post');
                }

                return { added: true, type: interactionType };
            }
        } catch (error) {
            console.warn('Reaction toggle error:', error);
            throw error;
        }
    }

    /**
     * Get user's reaction on a post
     * @param {string} postId - Post UUID
     * @param {string} userId - User UUID
     * @returns {Promise<string|null>}
     */
    async getUserReaction(postId, userId) {
        try {
            const { data, error } = await this.supabase
                .from('social_likes')
                .select('reaction_type')
                .eq('post_id', postId)
                .eq('user_id', userId)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;

            return data?.reaction_type || null;
        } catch (error) {
            console.warn('Get reaction error:', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 💬 COMMENT OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get comments for a post
     * @param {string} postId - Post UUID
     * @param {number} limit - Max comments
     * @returns {Promise<SocialComment[]>}
     */
    async getComments(postId, limit = 50) {
        try {
            const { data, error } = await this.supabase
                .from('social_comments')
                .select(`
          *,
          author:user_dna_profiles!author_id (
            user_id,
            username,
            full_name,
            display_name_preference,
            avatar_url,
            current_level
          )
        `)
                .eq('post_id', postId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) throw error;

            return data.map(row => createComment({
                ...row,
                author_username: row.author?.username,
                author_avatar: row.author?.avatar_url,
                author_level: row.author?.current_level
            }));
        } catch (error) {
            console.warn('Comments fetch error:', error);
            throw error;
        }
    }

    /**
     * Create comment
     * @param {Object} commentData - Comment data
     * @returns {Promise<SocialComment>}
     */
    async createComment({ postId, authorId, content, parentId = null }) {
        try {
            const { data, error } = await this.supabase
                .from('social_comments')
                .insert({
                    post_id: postId,
                    author_id: authorId,
                    content,
                    parent_id: parentId
                })
                .select(`
          *,
          author:user_dna_profiles!author_id (
            user_id,
            username,
            full_name,
            display_name_preference,
            avatar_url,
            current_level
          )
        `)
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('Comment insertion failed (blocked by RLS or constraint)');

            // Award comment diamonds (fire-and-forget, 5💎 max 3/day)
            if (authorId) {
                claimReward('/api/rewards/comment', { userId: authorId, commentId: data.id }, 'Strategy Comment');
            }

            // Emit EventBus for cross-page comment count updates ONLY IF SUCCESSFUL
            busEmit.socialCommentAdded(postId, authorId);

            return createComment({
                ...data,
                author_username: data.author?.username,
                author_avatar: data.author?.avatar_url,
                author_level: data.author?.current_level
            });
        } catch (error) {
            console.warn('Comment creation error:', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🤝 CONNECTION OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Follow a user
     * @param {string} followerId - Current user ID
     * @param {string} followingId - User to follow
     * @returns {Promise<boolean>}
     */
    async followUser(followerId, followingId) {
        try {
            const { error } = await this.supabase
                .from('social_connections')
                .insert({
                    follower_id: followerId,
                    following_id: followingId,
                    status: 'active'
                });

            if (error) throw error;

            // Award follow diamonds (fire-and-forget, 5💎 max 3/day)
            if (followerId) {
                claimReward('/api/rewards/follow', { userId: followerId, followingId }, 'Followed a Player');
            }

            return true;
        } catch (error) {
            console.warn('Follow error:', error);
            throw error;
        }
    }

    /**
     * Unfollow a user
     * @param {string} followerId - Current user ID
     * @param {string} followingId - User to unfollow
     * @returns {Promise<boolean>}
     */
    async unfollowUser(followerId, followingId) {
        try {
            const { error } = await this.supabase
                .from('social_connections')
                .delete()
                .eq('follower_id', followerId)
                .eq('following_id', followingId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.warn('Unfollow error:', error);
            throw error;
        }
    }

    /**
     * Check if following a user
     * @param {string} followerId - Current user ID
     * @param {string} followingId - Target user ID
     * @returns {Promise<boolean>}
     */
    async isFollowing(followerId, followingId) {
        try {
            const { data, error } = await this.supabase
                .from('social_connections')
                .select('id')
                .eq('follower_id', followerId)
                .eq('following_id', followingId)
                .eq('status', 'active')
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        } catch (error) {
            console.warn('Is following check error:', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 📺 VIDEO / WATCH OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    async getVideos({ limit = 20, offset = 0 }) {
        // Reuse getFeed with video filter
        return this.getFeed({ filter: 'video', limit, offset });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🎰 CLUB OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    async getClubs() {
        try {
            const { data, error } = await this.supabase
                .from('clubs')
                .select('*')
                .limit(20);

            if (error) throw error;
            return data;
        } catch (error) {
            console.warn('Clubs fetch failed', error);
            throw error;
        }
    }

    async getClub(clubId) {
        try {
            const { data, error } = await this.supabase
                .from('clubs')
                .select('*')
                .eq('id', clubId)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (error) {
            console.warn('Club fetch failed', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 👤 PROFILE OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    async getProfile(userId) {
        try {
            const { data, error } = await this.supabase
                .from('user_dna_profiles')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (error) {
            console.warn('Profile fetch error', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 💬 MESSAGING OPERATIONS (Mock for now)
    // ─────────────────────────────────────────────────────────────────────────

    async getConversations(userId) {
        try {
            // Fetch distinct conversations where user is sender or receiver
            const { data, error } = await this.supabase
                .from('social_messages')
                .select(`
                    id, sender_id, receiver_id, content, created_at,
                    sender:user_dna_profiles!sender_id(user_id, username, avatar_url),
                    receiver:user_dna_profiles!receiver_id(user_id, username, avatar_url)
                `)
                .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            // Group by conversation partner
            const convMap = new Map();
            (data || []).forEach(msg => {
                const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
                const partner = msg.sender_id === userId ? msg.receiver : msg.sender;
                if (!convMap.has(partnerId)) {
                    convMap.set(partnerId, {
                        id: `conv_${partnerId}`,
                        unreadCount: 0,
                        lastMessage: {
                            text: msg.content,
                            time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            isOwn: msg.sender_id === userId
                        },
                        participants: [{
                            id: partnerId,
                            name: partner?.username || 'Player',
                            avatar: partner?.avatar_url || null,
                            online: false
                        }]
                    });
                }
            });

            return Array.from(convMap.values());
        } catch (err) {
            console.warn('getConversations failed:', err.message);
            throw err;
        }
    }

    async getMessages(conversationId) {
        try {
            // Extract partner ID from conversation ID
            const partnerId = conversationId?.replace('conv_', '').replace('chat_', '');
            if (!partnerId) return [];

            const user = getAuthUser();
            if (!user) return [];

            const { data, error } = await this.supabase
                .from('social_messages')
                .select('id, sender_id, receiver_id, content, created_at')
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
                .order('created_at', { ascending: true })
                .limit(100);

            if (error) throw error;

            return (data || []).map(msg => ({
                id: msg.id,
                text: msg.content,
                time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                senderId: msg.sender_id
            }));
        } catch (err) {
            console.warn('getMessages failed:', err.message);
            throw err;
        }
    }

    async sendMessage(conversationId, text) {
        try {
            const partnerId = conversationId?.replace('conv_', '').replace('chat_', '');
            const user = getAuthUser();
            if (!user || !partnerId) throw new Error('Missing user or partner');

            const { data, error } = await this.supabase
                .from('social_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: partnerId,
                    content: text
                })
                .select('id, content, created_at')
                .maybeSingle();

            if (error) throw error;

            return {
                id: data?.id || Date.now(),
                text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                senderId: user.id
            };
        } catch (err) {
            console.warn('sendMessage failed:', err.message);
            throw err;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ⚡ REAL-TIME SUBSCRIPTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Subscribe to real-time feed updates
     * @param {Function} onNewPost - Callback for new posts
     * @param {Function} onPostUpdate - Callback for post updates
     * @returns {Function} Unsubscribe function
     */
    subscribeFeed(onNewPost, onPostUpdate) {
        // Clean up any previous channel to prevent zombie subscriptions
        // (e.g., React StrictMode double-mount or rapid remount)
        if (this.realtimeChannel) {
            this.supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
        // Use unique channel name to prevent collision when multiple views subscribe
        const channelId = `social_feed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.realtimeChannel = this.supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_posts'
                },
                (payload) => {
                    if (onNewPost) {
                        // Wrap raw DB row in createPost() to match the SocialPost format
                        // that views expect (author, engagement, isLiked, etc.)
                        const formattedPost = createPost({
                            ...payload.new,
                            post_id: payload.new.id,
                            author_username: 'New Post', // Minimal — will be refreshed by debounced full load
                            author_avatar: null,
                            author_level: 1,
                            like_count: 0,
                            comment_count: 0,
                            share_count: 0,
                            is_liked: false
                        });
                        onNewPost(formattedPost);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'social_posts'
                },
                (payload) => {
                    if (onPostUpdate) {
                        // Selective format: only update MUTABLE fields from Realtime payload
                        // DO NOT wrap in createPost() — payload.new has no author join data,
                        // so createPost() would create a broken author {username:'Anonymous'}
                        // and the consumer spread {...p, ...update} would overwrite the valid one.
                        const row = payload.new;
                        onPostUpdate({
                            id: row.id,
                            content: row.content,
                            contentType: row.content_type || 'text',
                            // Propagate thumbnail + media changes from background processes
                            // (e.g., cron filling in thumbnail_url after transcode)
                            thumbnail_url: row.thumbnail_url || null,
                            thumbnailUrl: row.thumbnail_url || null,
                            mediaUrls: row.media_urls || undefined, // undefined = don't overwrite if missing
                            engagement: {
                                likeCount: row.like_count || 0,
                                commentCount: row.comment_count || 0,
                                shareCount: row.share_count || 0,
                                viewCount: row.view_count || 0
                            },
                            visibility: row.visibility || 'public',
                            isPinned: row.is_pinned || false,
                            updatedAt: row.updated_at || row.created_at,
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            if (this.realtimeChannel) {
                this.supabase.removeChannel(this.realtimeChannel);
                this.realtimeChannel = null;
            }
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏭 FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function createSocialService(supabaseClient) {
    return new SocialService(supabaseClient);
}

export default SocialService;
