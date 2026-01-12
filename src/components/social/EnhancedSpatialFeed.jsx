/**
 * 📜 ENHANCED SPATIAL FEED CONTAINER V2
 * src/app/social/components/EnhancedSpatialFeed.jsx
 * 
 * Stacked-card layout with Challenge injections, Competitive filter,
 * and training integration.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSupabase } from '../../providers/SupabaseProvider';
import { useSocialOrb } from '../../providers/SocialOrbProvider';
import { SocialCard } from './SocialCard';
import { ChallengeCard } from './ChallengeCard';
import { ShareScoreCard } from './ShareScoreCard';
import { HeatMapBorder, GTOMasterGlow } from './HeatMapBorder';
import { SocialService } from '../SocialService';
import { FEED_FILTERS, initialFeedState } from '../types';
import { WarpLoader } from '../../components/WarpLoader';

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 EXTENDED FEED FILTERS
// ═══════════════════════════════════════════════════════════════════════════

const EXTENDED_FILTERS = {
    ...FEED_FILTERS,
    competitive: {
        label: 'Competitive',
        icon: '🏆',
        description: 'Top players & high earners'
    }
};

const CHALLENGE_INTERVAL = 5; // Show challenge every N posts

// ═══════════════════════════════════════════════════════════════════════════
// 📜 ENHANCED SPATIAL FEED
// ═══════════════════════════════════════════════════════════════════════════

export const EnhancedSpatialFeed = ({
    onCreatePost,
    onPostClick,
    onAuthorClick,
    onStartTraining
}) => {
    const { user, supabase } = useSupabase();
    const { state: socialState } = useSocialOrb();

    const [feedState, setFeedState] = useState(initialFeedState);
    const [activeFilter, setActiveFilter] = useState('recent');
    const [dismissedChallenges, setDismissedChallenges] = useState(new Set());
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

            // Use competitive filter logic
            const filterToUse = activeFilter === 'competitive' ? 'trending' : activeFilter;

            const { posts, hasMore } = await socialService.getFeed({
                userId: user.id,
                filter: filterToUse,
                limit: 20,
                offset
            });

            // For competitive, filter to GTO_MASTER or high-diamond players
            let filteredPosts = posts;
            if (activeFilter === 'competitive') {
                filteredPosts = posts.filter(p =>
                    p.author?.tier === 'GTO_MASTER' ||
                    p.engagement?.likeCount >= 20
                );
            }

            setFeedState(prev => ({
                ...prev,
                posts: reset ? filteredPosts : [...prev.posts, ...filteredPosts],
                hasMore,
                offset: offset + posts.length,
                isLoading: false
            }));
        } catch (error) {
            console.error('Feed load error:', error);
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

    useEffect(() => {
        loadFeed(true);
    }, [activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─────────────────────────────────────────────────────────────────────────
    // 👁️ INFINITE SCROLL
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
    // 🎮 CHALLENGE HANDLERS
    // ─────────────────────────────────────────────────────────────────────────
    const handleChallengeAccept = useCallback((challengeType) => {
        onStartTraining?.(challengeType);
    }, [onStartTraining]);

    const handleChallengeDismiss = useCallback((challengeType, index) => {
        setDismissedChallenges(prev => new Set([...prev, index]));
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // 💫 INTERACTION HANDLERS
    // ─────────────────────────────────────────────────────────────────────────
    const handleLike = useCallback(async (postId, reactionType) => {
        if (!socialService || !user) return;

        try {
            await socialService.toggleReaction(postId, user.id, reactionType);
        } catch (error) {
            console.error('Like error:', error);
            throw error;
        }
    }, [socialService, user]);

    const handlePlayChallenge = useCallback((challengeId, challengeType) => {
        onStartTraining?.(challengeType, challengeId);
    }, [onStartTraining]);

    // ─────────────────────────────────────────────────────────────────────────
    // 🏗️ BUILD FEED ITEMS WITH CHALLENGES
    // ─────────────────────────────────────────────────────────────────────────
    const feedItems = useMemo(() => {
        const items = [];
        const challengeTypes = ['preflop', 'range', 'gto', 'blitz'];
        let challengeIndex = 0;

        feedState.posts.forEach((post, index) => {
            // Insert challenge card every N posts
            if (index > 0 && index % CHALLENGE_INTERVAL === 0) {
                const challengeKey = `challenge-${index}`;
                if (!dismissedChallenges.has(challengeKey)) {
                    items.push({
                        type: 'challenge',
                        key: challengeKey,
                        challengeType: challengeTypes[challengeIndex % challengeTypes.length],
                        index: index
                    });
                    challengeIndex++;
                }
            }

            // Add post (check if it's a score share)
            if (post.contentType === 'achievement' && post.achievementData?.score !== undefined) {
                items.push({
                    type: 'score',
                    key: post.id,
                    post: post
                });
            } else {
                items.push({
                    type: 'post',
                    key: post.id,
                    post: post
                });
            }
        });

        return items;
    }, [feedState.posts, dismissedChallenges]);

    // ─────────────────────────────────────────────────────────────────────────
    // 🎨 RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="enhanced-spatial-feed">
            {/* Filter Sub-Rail */}
            <nav className="feed-filters glass-panel">
                {Object.entries(EXTENDED_FILTERS).map(([key, config]) => (
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
                <span className="create-text">Share with the community...</span>
            </button>

            {/* Feed Container */}
            <div className="feed-container" ref={feedRef}>
                {/* Empty State */}
                {!feedState.isLoading && feedState.posts.length === 0 && (
                    <div className="feed-empty glass-card">
                        <div className="empty-icon">🌐</div>
                        <h3>No posts yet</h3>
                        <p>Be the first to share something!</p>
                        <button
                            className="empty-cta interactive glow-shift"
                            onClick={onCreatePost}
                        >
                            Create Post
                        </button>
                    </div>
                )}

                {/* Posts with Challenges */}
                <div className="posts-stack">
                    {feedItems.map((item, index) => {
                        if (item.type === 'challenge') {
                            return (
                                <ChallengeCard
                                    key={item.key}
                                    challengeType={item.challengeType}
                                    onAccept={handleChallengeAccept}
                                    onDismiss={() => handleChallengeDismiss(item.challengeType, item.key)}
                                    animationDelay={index * 50}
                                />
                            );
                        }

                        if (item.type === 'score') {
                            return (
                                <ShareScoreCard
                                    key={item.key}
                                    post={item.post}
                                    currentUserId={user?.id}
                                    onPlayChallenge={handlePlayChallenge}
                                    onLike={handleLike}
                                    onAuthorClick={onAuthorClick}
                                    animationDelay={index * 50}
                                />
                            );
                        }

                        // Regular post with heat map
                        const isGTOMaster = item.post.author?.tier === 'GTO_MASTER';
                        const PostWrapper = isGTOMaster ? GTOMasterGlow : React.Fragment;
                        const wrapperProps = isGTOMaster ? { isGTOMaster: true } : {};

                        return (
                            <HeatMapBorder
                                key={item.key}
                                engagement={item.post.engagement?.likeCount || 0}
                                recentEngagement={item.post.engagement?.likeCount || 0}
                            >
                                <PostWrapper {...wrapperProps}>
                                    <SocialCard
                                        post={item.post}
                                        currentUserId={user?.id}
                                        onLike={handleLike}
                                        onComment={(postId) => onPostClick?.(postId, true)}
                                        onShare={(postId) => {
                                            const url = `${window.location.origin}/app/post/${postId}`;
                                            navigator.clipboard?.writeText(url);
                                        }}
                                        onAuthorClick={onAuthorClick}
                                        onPostClick={onPostClick}
                                        animationDelay={index * 50}
                                    />
                                </PostWrapper>
                            </HeatMapBorder>
                        );
                    })}
                </div>

                {/* Load More */}
                {feedState.hasMore && (
                    <div ref={loadMoreRef} className="load-more-trigger">
                        {feedState.isLoading && (
                            <div className="loading-indicator">
                                <div className="loading-spinner" />
                                <span>Loading more...</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Initial Loading */}
                {feedState.isLoading && feedState.posts.length === 0 && (
                    <WarpLoader
                        message="Loading Feed..."
                        subMessage="Fetching latest posts"
                        variant="pulse"
                        size="inline"
                    />
                )}

                {/* Error */}
                {feedState.error && (
                    <div className="feed-error glass-card">
                        <span className="error-icon">⚠️</span>
                        <span>{feedState.error}</span>
                        <button onClick={() => loadFeed(true)}>Retry</button>
                    </div>
                )}
            </div>

            <style>{`
        .enhanced-spatial-feed {
          max-width: 680px;
          margin: 0 auto;
          padding: 20px 0;
        }
        
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
          overflow-x: auto;
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
          min-width: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          white-space: nowrap;
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
          width: 16px;
          height: 3px;
          background: #00FFFF;
          border-radius: 2px;
          box-shadow: 0 0 10px #00FFFF;
        }
        
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
        
        .feed-container {
          perspective: 1200px;
        }
        
        .posts-stack {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .feed-empty {
          text-align: center;
          padding: 48px 24px;
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
          .enhanced-spatial-feed {
            padding: 12px;
          }
          
          .filter-label {
            display: none;
          }
          
          .filter-tab {
            padding: 10px;
            min-width: 50px;
          }
        }
      `}</style>
        </div>
    );
};

export default EnhancedSpatialFeed;
