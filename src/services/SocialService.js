/**
 * 🌐 SOCIAL SERVICE — SUPABASE API LAYER
 * src/app/social/SocialService.js
 * 
 * Backend API interactions for social features with optimistic updates.
 */

import { createPost, createComment, createAuthor } from './social-types';

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
            // 1. Try V2 RPC first (Fixed function)
            const { data: rpcData, error: rpcError } = await this.supabase.rpc('fn_get_social_feed_v2', {
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
                    author_avatar: row.author_avatar,
                    author_level: row.author_level,
                    content: row.content,
                    content_type: row.content_type,
                    media_urls: row.media_urls,
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
            console.error('Feed fetch error:', error);
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
                .single();

            if (error) throw error;

            return createPost(data, createAuthor(data.author));
        } catch (error) {
            console.error('Post fetch error:', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ✍️ POST OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create new post
     * @param {Object} postData - Post data
     * @returns {Promise<SocialPost>}
     */
    async createPost({ authorId, content, contentType = 'text', mediaUrls = [], visibility = 'public', achievementData = null }) {
        try {
            console.log('📝 Creating post:', { authorId, content: content?.substring(0, 50), contentType });

            // 1. Try V2 RPC first (Bypasses "ambiguous column" triggers)
            const { data: rpcData, error: rpcError } = await this.supabase.rpc('fn_create_social_post', {
                p_author_id: authorId,
                p_content: content,
                p_content_type: contentType,
                p_media_urls: mediaUrls,
                p_visibility: visibility,
                p_achievement_data: achievementData
            });

            if (!rpcError && rpcData) {
                console.log('✅ Post created via RPC:', rpcData.id);
                return createPost({
                    ...rpcData,
                    post_id: rpcData.id,
                    author_username: 'You',
                    author_avatar: null,
                    author_level: 1,
                    is_liked: false
                });
            } else if (rpcError) {
                console.warn('RPC create failed, falling back to direct insert', rpcError);
            }

            // Fallback (Legacy)
            const { data, error } = await this.supabase
                .from('social_posts')
                .insert({
                    author_id: authorId,
                    content,
                    content_type: contentType,
                    media_urls: mediaUrls,
                    visibility,
                    achievement_data: achievementData
                })
                .select('*')
                .single();

            if (error) {
                console.error('❌ Post insert error:', error);
                throw error;
            }

            console.log('✅ Post created (Direct):', data.id);

            // Return simplified post object
            return createPost({
                ...data,
                author_id: authorId,
                author_username: 'You',
                author_avatar: null,
                author_level: 1
            });
        } catch (error) {
            console.error('Post creation error:', error);
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
                .single();

            if (error) throw error;

            return createPost(data);
        } catch (error) {
            console.error('Post update error:', error);
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
            const { error } = await this.supabase
                .from('social_posts')
                .delete()
                .eq('id', postId);

            if (error) throw error;

            return true;
        } catch (error) {
            console.error('Post deletion error:', error);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 💫 INTERACTION OPERATIONS (OPTIMISTIC UPDATES)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Toggle like/reaction on post
     * @param {string} postId - Post UUID
     * @param {string} userId - User UUID
     * @param {string} interactionType - Interaction type
     * @returns {Promise<{ added: boolean, type: string }>}
     */
    async toggleReaction(postId, userId, interactionType = 'like') {
        try {
            // Check if reaction exists
            const { data: existing } = await this.supabase
                .from('social_interactions')
                .select('id')
                .eq('post_id', postId)
                .eq('user_id', userId)
                .eq('interaction_type', interactionType)
                .single();

            if (existing) {
                // Remove reaction
                const { error } = await this.supabase
                    .from('social_interactions')
                    .delete()
                    .eq('id', existing.id);

                if (error) throw error;
                return { added: false, type: interactionType };
            } else {
                // Add reaction
                const { error } = await this.supabase
                    .from('social_interactions')
                    .insert({
                        post_id: postId,
                        user_id: userId,
                        interaction_type: interactionType
                    });

                if (error) throw error;
                return { added: true, type: interactionType };
            }
        } catch (error) {
            console.error('Reaction toggle error:', error);
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
                .from('social_interactions')
                .select('interaction_type')
                .eq('post_id', postId)
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            return data?.interaction_type || null;
        } catch (error) {
            console.error('Get reaction error:', error);
            return null;
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
            console.error('Comments fetch error:', error);
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
            avatar_url,
            current_level
          )
        `)
                .single();

            if (error) throw error;

            return createComment({
                ...data,
                author_username: data.author?.username,
                author_avatar: data.author?.avatar_url,
                author_level: data.author?.current_level
            });
        } catch (error) {
            console.error('Comment creation error:', error);
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
            return true;
        } catch (error) {
            console.error('Follow error:', error);
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
            console.error('Unfollow error:', error);
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
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        } catch (error) {
            console.error('Is following check error:', error);
            return false;
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
            console.warn('Clubs fetch failed, returning mock', error);
            return [
                { id: 1, name: 'Las Vegas Grinders', members: 1240, cover: 'https://picsum.photos/800/300?club=1' },
                { id: 2, name: 'GTO Academy', members: 850, cover: 'https://picsum.photos/800/300?club=2' }
            ];
        }
    }

    async getClub(clubId) {
        try {
            const { data, error } = await this.supabase
                .from('clubs')
                .select('*')
                .eq('id', clubId)
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.warn('Club fetch failed', error);
            return null;
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
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Profile fetch error', error);
            // Return mock if needed or null
            return {
                user_id: userId,
                username: 'Unknown Player',
                avatar_url: 'https://picsum.photos/200',
                current_level: 1,
                stats: {}
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 💬 MESSAGING OPERATIONS (Mock for now)
    // ─────────────────────────────────────────────────────────────────────────

    async getConversations(userId) {
        // Simulate API delay
        await new Promise(r => setTimeout(r, 500));
        return [
            {
                id: 'c1',
                unreadCount: 1,
                lastMessage: { text: 'You call that a raise?', time: '2m', isOwn: false },
                participants: [
                    { id: 'u2', name: 'Mike Shark', avatar: 'https://picsum.photos/101/101', online: true }
                ]
            }
        ];
    }

    async getMessages(conversationId) {
        await new Promise(r => setTimeout(r, 300));
        return [
            { id: 1, text: 'Hey, nice hand earlier!', time: '10:30 AM', senderId: 'u2' },
            { id: 2, text: 'Thanks! I knew he was bluffing.', time: '10:31 AM', senderId: 'u1' }
        ];
    }

    async sendMessage(conversationId, text) {
        console.log('Sending message:', text, 'to', conversationId);
        return { id: Date.now(), text, time: 'Now', senderId: 'u1' };
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
        this.realtimeChannel = this.supabase
            .channel('social_feed')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_posts'
                },
                (payload) => {
                    if (onNewPost) onNewPost(payload.new);
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
                    if (onPostUpdate) onPostUpdate(payload.new);
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
