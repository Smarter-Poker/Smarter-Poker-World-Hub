/**
 * 📜 SPATIAL FEED CONTAINER
 * src/app/social/components/SpatialFeed.jsx
 * 
 * Stacked-card layout with elastic-spring physics for anti-gravity scrolling.
 * Items float into view and drift on exit.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SocialCard } from './SocialCard';
import { claimReward } from '../../lib/claimReward';
import { useSupabase } from '../../providers/SupabaseProvider';
import { SocialService } from '../../services/SocialService';
import { FEED_FILTERS, initialFeedState } from '../../services/social-types';
import { eventBus, EventType, busEmit } from '../../engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// 📜 SPATIAL FEED COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const SpatialFeed = ({
  onCreatePost,
  onPostClick,
  onAuthorClick
}) => {
  const { user, supabase } = useSupabase();

  const [feedState, setFeedState] = useState(initialFeedState);
  const [activeFilter, setActiveFilter] = useState('recent');
  const feedRef = useRef(null);
  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  // Social service instance
  const socialService = useMemo(() => {
    if (!supabase) return null;
    return new SocialService(supabase);
  }, [supabase]);

  // ─────────────────────────────────────────────────────────────────────────
  // 📰 LOAD FEED
  // ─────────────────────────────────────────────────────────────────────────
  const loadFeed = useCallback(async (reset = false) => {
    if (!socialService || !user) return;
    if (feedState.isLoading) return;

    setFeedState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      offset: reset ? 0 : prev.offset
    }));

    try {
      const offset = reset ? 0 : feedState.offset;
      const { posts, hasMore } = await socialService.getFeed({
        userId: user.id,
        filter: activeFilter,
        limit: 20,
        offset
      });

      setFeedState(prev => ({
        ...prev,
        posts: reset ? posts : [...prev.posts, ...posts],
        hasMore,
        offset: offset + posts.length,
        isLoading: false
      }));
    } catch (error) {
      console.warn('Feed load error:', error);
      setFeedState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load feed'
      }));
    }
  }, [socialService, user, activeFilter, feedState.isLoading, feedState.offset]);

  // ─────────────────────────────────────────────────────────────────────────
  // 🔄 FILTER CHANGE
  // ─────────────────────────────────────────────────────────────────────────
  const handleFilterChange = useCallback((filter) => {
    setActiveFilter(filter);
    setFeedState(prev => ({ ...prev, posts: [], offset: 0, hasMore: true }));
  }, []);

  // Reload when filter changes
  useEffect(() => {
    loadFeed(true);
  }, [activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // 👁️ INFINITE SCROLL OBSERVER
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loadMoreRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feedState.hasMore && !feedState.isLoading) {
          loadFeed(false);
        }
      },
      { threshold: 0.1 }
    );

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [feedState.hasMore, feedState.isLoading, loadFeed]);

  // ─────────────────────────────────────────────────────────────────────────
  // ⚡ REAL-TIME SUBSCRIPTION
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socialService) return;

    const unsubscribe = socialService.subscribeFeed(
      (newPost) => {
        // Add new post to top of feed (with dedup guard)
        setFeedState(prev => {
          if (prev.posts.some(p => p.id === newPost.id)) return prev;
          return { ...prev, posts: [newPost, ...prev.posts] };
        });
      },
      (updatedPost) => {
        // Update existing post
        setFeedState(prev => ({
          ...prev,
          posts: prev.posts.map(p =>
            p.id === updatedPost.id ? { ...p, ...updatedPost } : p
          )
        }));
      }
    );

    return unsubscribe;
  }, [socialService]);

  // ─────────────────────────────────────────────────────────────────────────
  // 🔄 EVENT BUS LISTENERS — cross-component sync
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let debounceTimer = null;
    const debouncedRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadFeed(true);
        debounceTimer = null;
      }, 3000);
    };

    const unsub1 = eventBus.on(EventType.SOCIAL_POST_CREATED, debouncedRefetch);
    const unsub1_refresh = eventBus.on(EventType.SOCIAL_FEED_REFRESHED, debouncedRefetch);

    // Update like counts locally without full refetch
    // Skip events from current user — SocialCard already handled optimistic update
    const unsub2 = eventBus.on(EventType.SOCIAL_POST_LIKED, (event) => {
      const { postId, userId, added } = event?.payload || {};
      if (!postId || userId === user?.id) return; // Skip self — already handled optimistically
      setFeedState(prev => ({
        ...prev,
        posts: prev.posts.map(p => {
          if (p.id !== postId) return p;
          const delta = added ? 1 : -1;
          return {
            ...p,
            engagement: {
              ...p.engagement,
              likeCount: Math.max(0, (p.engagement?.likeCount || 0) + delta)
            }
          };
        })
      }));
    });

    // Update comment counts locally without full refetch
    const unsub3 = eventBus.on(EventType.SOCIAL_COMMENT_ADDED, (event) => {
      const { postId } = event?.payload || {};
      if (postId) {
        setFeedState(prev => ({
          ...prev,
          posts: prev.posts.map(p =>
            p.id === postId
              ? { ...p, engagement: { ...p.engagement, commentCount: (p.engagement?.commentCount || 0) + 1 } }
              : p
          )
        }));
      }
    });

    return () => {
      unsub1?.();
      unsub2?.();
      unsub3?.();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadFeed]);

  // ─────────────────────────────────────────────────────────────────────────
  // 💫 INTERACTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId, reactionType) => {
    if (!socialService || !user) return;

    try {
      const { added, type } = await socialService.toggleReaction(postId, user.id, reactionType);
      // Only emit bus event when like_count changes (added=true/false). Skip swaps (added=null).
      if (added !== null && added !== undefined) {
          busEmit.socialPostLiked(postId, user.id, { added, reactionType: type });
      }
    } catch (error) {
      console.warn('Like error:', error);
      // Authoritative state resynchronization on failure
      try {
        const [{ data: postData }, { data: likeData }] = await Promise.all([
          supabase.from('social_posts').select('like_count').eq('id', postId).maybeSingle(),
          supabase.from('social_likes').select('reaction_type').eq('post_id', postId).eq('user_id', user.id)
        ]);
        
        setFeedState(prev => ({
          ...prev,
          posts: prev.posts.map(p => {
            if (p.id !== postId) return p;
            return {
              ...p,
              isLiked: likeData?.some(r => r.reaction_type === 'like') || false,
              engagement: {
                ...p.engagement,
                likeCount: postData?.like_count || 0
              }
            };
          })
        }));
      } catch (resyncError) {
        console.warn('Resync failed:', resyncError);
      }
    }
  }, [socialService, user]);

  const handleComment = useCallback((postId) => {
    onPostClick?.(postId, true); // Open with comment focus
  }, [onPostClick]);

  const handleShare = useCallback((postId) => {
    const url = `${window.location.origin}/app/post/${postId}`;
    navigator.clipboard?.writeText(url);
    // Award share diamonds (fire-and-forget, 1/day max)
    if (user?.id) {
      claimReward('/api/rewards/share', { userId: user.id, shareType: 'post', contentId: postId }, 'Shared a Post');
    }
  }, [user?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // 🎨 RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="spatial-feed">
      {/* Filter Sub-Rail */}
      <nav className="feed-filters glass-panel">
        {Object.entries(FEED_FILTERS || {}).map(([key, config]) => (
          <button
            key={key}
            className={`filter-tab interactive ${activeFilter === key ? 'active' : ''}`}
            onClick={() => handleFilterChange(key)}
          >
            <span className="filter-icon">{config.icon}</span>
            <span className="filter-label">{config.label}</span>
            {activeFilter === key && <div className="filter-indicator" />}
          </button>
        ))}
      </nav>

      {/* Create Post Button */}
      <button
        className="create-post-btn interactive glow-shift"
        onClick={onCreatePost}
      >
        <span className="create-icon">✍️</span>
        <span className="create-text">Share With The Community...</span>
      </button>

      {/* Feed Container */}
      <div className="feed-container" ref={feedRef}>
        {/* Empty State */}
        {!feedState.isLoading && feedState.posts.length === 0 && (
          <div className="feed-empty glass-card">
            <div className="empty-icon">🌐</div>
            <h3>No Posts Yet</h3>
            <p>Be The First To Share Something With The Community!</p>
            <button
              className="empty-cta interactive glow-shift"
              onClick={onCreatePost}
            >
              Create Post
            </button>
          </div>
        )}

        {/* Posts */}
        <div className="posts-stack">
          {feedState.posts.map((post, index) => (
            <SocialCard
              key={post.id}
              post={post}
              currentUserId={user?.id}
              onLike={handleLike}
              onComment={handleComment}
              onShare={handleShare}
              onAuthorClick={onAuthorClick}
              onPostClick={onPostClick}
              animationDelay={index * 50}
            />
          ))}
        </div>

        {/* Load More Trigger */}
        {feedState.hasMore && (
          <div ref={loadMoreRef} className="load-more-trigger">
            {feedState.isLoading && (
              <div className="loading-indicator">
                <div className="loading-spinner" />
                <span>Loading More Posts...</span>
              </div>
            )}
          </div>
        )}

        {/* Initial Loading */}
        {feedState.isLoading && feedState.posts.length === 0 && (
          <div className="feed-initial-loading" style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px', width: 32, height: 32, borderWidth: 3 }}></div>
            <h3>Loading Feed...</h3>
            <p style={{ fontSize: 14 }}>Fetching latest posts</p>
          </div>
        )}

        {/* Error State */}
        {feedState.error && (
          <div className="feed-error glass-card">
            <span className="error-icon">⚠️</span>
            <span>{feedState.error}</span>
            <button onClick={() => loadFeed(true)}>Retry</button>
          </div>
        )}
      </div>

      <style>{`
        .spatial-feed {
          max-width: 680px;
          margin: 0 auto;
          padding: 20px 0;
        }
        
        /* Filter Navigation */
        .feed-filters {
          display: flex;
          gap: 4px;
          padding: 6px;
          margin-bottom: 20px;
          border-radius: 16px;
          position: sticky;
          top: 0;
          z-index: 50;
          animation: filter-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes filter-slide-in {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .filter-tab {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .filter-tab:hover {
          color: white;
          background: rgba(255, 255, 255, 0.05);
        }
        
        .filter-tab.active {
          color: #00FFFF;
          background: rgba(0, 255, 255, 0.1);
        }
        
        .filter-icon {
          font-size: 1rem;
        }
        
        .filter-indicator {
          position: absolute;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 3px;
          background: #00FFFF;
          border-radius: 2px;
          box-shadow: 0 0 10px #00FFFF;
        }
        
        /* Create Post Button */
        .create-post-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 16px 20px;
          margin-bottom: 20px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.95rem;
          text-align: left;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .create-post-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(0, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.8);
        }
        
        .create-icon {
          font-size: 1.25rem;
        }
        
        /* Feed Container */
        .feed-container {
          perspective: 1200px;
        }
        
        .posts-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        /* Empty State */
        .feed-empty {
          text-align: center;
          padding: 48px 24px;
          animation: empty-float 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes empty-float {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .empty-icon {
          font-size: 4rem;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        
        .feed-empty h3 {
          font-family: 'Exo 2', sans-serif;
          color: white;
          margin: 0 0 8px 0;
        }
        
        .feed-empty p {
          color: rgba(255, 255, 255, 0.5);
          margin: 0 0 24px 0;
        }
        
        .empty-cta {
          padding: 12px 24px;
          background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(0, 191, 255, 0.1));
          border: 1px solid rgba(0, 255, 255, 0.3);
          border-radius: 12px;
          color: #00FFFF;
          font-weight: 600;
          cursor: pointer;
        }
        
        /* Loading */
        .load-more-trigger {
          padding: 24px;
          display: flex;
          justify-content: center;
        }
        
        .loading-indicator {
          display: flex;
          align-items: center;
          gap: 12px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.9rem;
        }
        
        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(0, 255, 255, 0.2);
          border-top-color: #00FFFF;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        /* Error State */
        .feed-error {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: rgba(255, 68, 68, 0.1);
          border-color: rgba(255, 68, 68, 0.3);
          color: #FF6B6B;
        }
        
        .feed-error button {
          margin-left: auto;
          padding: 8px 16px;
          background: rgba(255, 68, 68, 0.2);
          border: 1px solid rgba(255, 68, 68, 0.3);
          border-radius: 8px;
          color: #FF6B6B;
          cursor: pointer;
        }
        
        @media (max-width: 600px) {
          .spatial-feed {
            padding: 12px;
          }
          
          .filter-label {
            display: none;
          }
          
          .filter-tab {
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
};

export default SpatialFeed;
