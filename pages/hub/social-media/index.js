/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨🚨🚨 PROTECTED FILE - READ BEFORE MODIFYING 🚨🚨🚨                      ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  THIS FILE CONTAINS MULTIPLE CRITICAL FEATURES THAT BREAK FREQUENTLY.    ║
 * ║  BEFORE MAKING ANY CHANGES:                                              ║
 * ║                                                                           ║
 * ║  1. RUN: /social-feed-protection workflow                                ║
 * ║  2. READ: .agent/PROTECTED_FILES.md                                      ║
 * ║  3. TEST BEFORE: node scripts/test-article-reader.js                     ║
 * ║  4. TEST AFTER: node scripts/test-article-reader.js                      ║
 * ║                                                                           ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  CRITICAL FEATURES IN THIS FILE - DO NOT BREAK:                          ║
 * ║                                                                           ║
 * ║  📰 Article Reader (Lines ~1186-1200, ~1417, ~2509)                       ║
 * ║     - ArticleCard with onClick → opens ArticleReaderModal                 ║
 * ║     - articleReader state {open, url, title}                             ║
 * ║     - onOpenArticle prop passed to PostCard                              ║
 * ║                                                                           ║
 * ║  📖 Stories Bar (Line ~2330)                                              ║
 * ║     - StoriesBar component with stories fetch                            ║
 * ║                                                                           ║
 * ║   Reels Carousel (Lines ~2510)                                          ║
 * ║     - ReelsFeedCarousel inserted after every 3 posts                     ║
 * ║                                                                           ║
 * ║  🔴 Live Streaming (Lines ~2360-2400)                                     ║
 * ║     - GoLiveModal, LiveStreamCard, LiveStreamViewer                      ║
 * ║                                                                           ║
 * ║  📋 PostCard Component (Lines ~1072-1300)                                 ║
 * ║     - Renders all post types correctly                                   ║
 * ║     - onOpenArticle prop for article clicks                              ║
 * ║                                                                           ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  SMARTER.POKER SOCIAL HUB                                                ║
 * ║  Light Theme + Working Supabase Integration + Go Live Streaming          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useFeedPrefetchObserver } from '../../../src/hooks/useProfilePrefetch';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import { supabase } from '../../../src/lib/supabase';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAuthUser, ensureAuthReady } from '../../../src/lib/authUtils';
import { useExternalLink } from '../../../src/components/ui/ExternalLinkModal';
import { useUnreadCount } from '../../../src/hooks/useUnreadCount';
import { StoriesBar } from '../../../src/components/social/Stories';
import { ReelsFeedCarousel } from '../../../src/components/social/ReelsFeedCarousel';
import { GoLiveModal } from '../../../src/components/social/GoLiveModal';
import { LiveStreamCard } from '../../../src/components/social/LiveStreamCard';
import { LiveStreamViewer } from '../../../src/components/social/LiveStreamViewer';
import LiveStreamService from '../../../src/services/LiveStreamService';
import ArticleCard from '../../../src/components/social/ArticleCard';
import ArticleReaderModal from '../../../src/components/social/ArticleReaderModal';
import InviteFriendsModal from '../../../src/components/ui/InviteFriendsModal';
import { SocialProfileGateForCurrentUser } from '../../../src/components/gates/SocialProfileCompletionGate';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { useActiveIdentity } from '../../../src/contexts/ActiveIdentityContext';
import { isHorseOnlineNow } from '../../../src/lib/horsePresence';
import { blockUser, getBlockedUsers } from '../../../src/services/privacy-service';

// God-Mode Stack
import { useSocialStore } from '../../../src/stores/socialStore';
import PageTransition from '../../../src/components/transitions/PageTransition';
import toast from '../../../src/stores/toastStore';
import { getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { broadcastSync, listenBroadcast, BROADCAST_TAB_ID } from '../../../src/lib/broadcastSync';
import GiphyPicker from '../../../src/components/shared/GiphyPicker';
import CheckInModal from '../../../src/components/social/CheckInModal';
import TrendingVenues from '../../../src/components/social/TrendingVenues';
import { SharedPostCreator } from '../../../src/components/social/SharedPostCreator';
import GhostPostCard from '../../../src/components/social/GhostPostCard';
import dynamic from 'next/dynamic';
const SharePostModal = dynamic(() => import('../../../src/components/social/SharePostModal'), {
  ssr: false,
});
const ShareStreakLeaderboard = dynamic(
  () => import('../../../src/components/social/ShareStreakLeaderboard'),
  { ssr: false }
);
// Shared utilities — single source of truth (extracted from this file)
import {
  SOCIAL_COLORS,
  SOCIAL_COLORS as C,
  timeAgo,
  decodeHtmlEntities,
  isYouTubeUrl,
  getYouTubeVideoId,
  getYouTubeEmbedUrl,
  getYouTubeThumbnail,
  validateYouTubeVideo,
  sniffMimeType,
} from '../../../src/lib/socialHelpers';
import { SharedAvatar as Avatar } from '../../../src/components/social/SharedAvatar';
import {
  VideoThumbnail,
  VideoPostWrapper,
  FeedVideoPoster,
} from '../../../src/components/social/SharedVideoComponents';

import { feedCache } from '../../../src/lib/feedCache';

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 LINK PREVIEW CARD - Fetches and displays rich link metadata for feed posts
// ═══════════════════════════════════════════════════════════════════════════
//  CRITICAL: DO NOT MODIFY without running /social-feed-protection workflow
// This component has broken 4+ times. Key requirements:
// - Uses useExternalLink for internal popups (NOT target="_blank")
// - Image uses aspectRatio: '16/9' and objectFit: 'cover' (full width, no black bars)
// - decodeHtmlEntities for title/description (fixes &#039; display)
// ═══════════════════════════════════════════════════════════════════════════

// Module-level cache to deduplicate link preview fetches across all cards in a session
// Capped at 200 entries (LRU eviction) to prevent unbounded memory growth.
const LINK_PREVIEW_CACHE_MAX = 200;
const linkPreviewCache = new Map();
const linkPreviewInflight = new Map();

function setLinkPreviewCache(key, value) {
  if (linkPreviewCache.size >= LINK_PREVIEW_CACHE_MAX) {
    linkPreviewCache.delete(linkPreviewCache.keys().next().value); // evict oldest
  }
  linkPreviewCache.set(key, value);
}

function LinkPreviewCard({ url }) {
  const { openExternal } = useExternalLink();
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) return;

    // Check in-memory cache first to avoid duplicate network requests
    if (linkPreviewCache.has(url)) {
      setMetadata(linkPreviewCache.get(url));
      setLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      try {
        let data;
        // Deduplicate: if a request for this URL is already in-flight, await it
        if (linkPreviewInflight.has(url)) {
          data = await linkPreviewInflight.get(url);
        } else {
          const promise = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`).then((r) =>
            r.json()
          );
          linkPreviewInflight.set(url, promise);
          data = await promise;
          linkPreviewInflight.delete(url);
        }
        // Only cache if we got useful data (allows retry on empty fallback responses)
        if (data && (data.image || data.title)) {
          setLinkPreviewCache(url, data);
        }
        setMetadata(data);
      } catch (error) {
        console.warn('Failed to fetch link metadata:', error);
        linkPreviewInflight.delete(url);
        // Fallback to basic info
        try {
          const urlObj = new URL(url);
          setMetadata({
            title: urlObj.pathname.split('/').pop()?.replace(/-/g, ' ') || 'Link',
            description: null,
            image: null,
            siteName: urlObj.hostname.replace(/^www\./, ''),
          });
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      }
      setLoading(false);
    };

    fetchMetadata();
  }, [url]);

  if (loading) {
    return (
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: C.bg,
          margin: '0 12px 12px',
        }}
      >
        <div
          style={{
            height: 200,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 24,
          }}
        >
          ⏳ Loading Preview...
        </div>
      </div>
    );
  }

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Use the in-app ExternalLinkModal rather than opening a new tab
    // The modal tries iframe first, falls back to "Copy Link" if site blocks embedding
    openExternal(url, metadata?.title || 'Link Preview');
  };

  return (
    <div
      onClick={handleClick}
      style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}
    >
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: C.bg,
          margin: '0 12px 12px',
        }}
      >
        {/* Link Preview Image - full width, proper aspect ratio */}
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            position: 'relative',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            overflow: 'hidden',
          }}
        >
          {metadata?.image ? (
            <img
              src={metadata.image}
              alt={metadata.title || 'Link preview'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center center',
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'white',
                fontSize: 48,
              }}
            >
              🔗
            </div>
          )}
        </div>
        {/* Link Info */}
        <div style={{ padding: '12px 16px', background: C.card }}>
          <div
            style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}
          >
            {metadata?.siteName || new URL(url).hostname.replace('www.', '')}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
            {decodeHtmlEntities(metadata?.title) || 'View Article'}
          </div>
          {metadata?.description && (
            <div
              style={{
                fontSize: 13,
                color: C.textSec,
                marginTop: 6,
                lineHeight: 1.4,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {decodeHtmlEntities(metadata.description)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PostCard = React.memo(
  function PostCard({
    post,
    currentUserId,
    currentUserName,
    currentUserAvatar,
    onLike,
    onDelete,
    onComment,
    onOpenArticle,
    onBlock,
    onShare,
    horseProfileIds = new Set(),
  }) {
    const router = useRouter();
    const [liked, setLiked] = useState(post.isLiked);
    const [likeCount, setLikeCount] = useState(post.likeCount);
    const [reactions, setReactions] = useState(post.reactions || []);
    const [replyingTo, setReplyingTo] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [showReactionPicker, setShowReactionPicker] = useState(false);

    // Phase 28: Render @mentions as clickable links
    function renderMentions(text) {
      if (!text) return text;
      const parts = text.split(/(@[\w.]+)/g);
      return parts.map((part, i) => {
        if (part.startsWith('@')) {
          const username = part.slice(1);
          return React.createElement(
            'a',
            {
              key: i,
              href: `/hub/user/${username}`,
              style: { color: C.blue, fontWeight: 600, textDecoration: 'none' },
              onClick: (e) => {
                e.preventDefault();
                router.push(`/hub/user/${username}`);
              },
            },
            part
          );
        }
        return part;
      });
    }
    const [bookmarked, setBookmarked] = useState(post.isBookmarked || false);
    const [bookmarkCount, setBookmarkCount] = useState(post.bookmarkCount || 0);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentCount, setCommentCount] = useState(post.commentCount || 0);
    const [shareCount, setShareCount] = useState(post.shareCount || 0);
    const [hasShared, setHasShared] = useState(false); // Can be hydrated from props if needed later
    const [hasMoreComments, setHasMoreComments] = useState(false);
    const [typists, setTypists] = useState({}); // { [userId]: { name, avatar_url, timestamp } }
    const [displayContent, setDisplayContent] = useState(post.content);
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editCommentText, setEditCommentText] = useState('');
    const [deletingCommentId, setDeletingCommentId] = useState(null); // graceful delete confirm
    const commentInputRef = useRef(null); // auto-focus on open
    // GIF + Image attachment state for comments
    const [showCommentGifPicker, setShowCommentGifPicker] = useState(false);
    const [commentMediaUrl, setCommentMediaUrl] = useState(null);
    const [commentMediaType, setCommentMediaType] = useState(null); // 'gif' | 'image'
    const [uploadingCommentImage, setUploadingCommentImage] = useState(false);
    const commentFileInputRef = useRef(null);
    // Phase 3: See More, lightbox, double-tap, comment scroll
    const [expanded, setExpanded] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [lightboxImages, setLightboxImages] = useState([]);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [doubleTapHeart, setDoubleTapHeart] = useState(false);
    const [isReporting, setIsReporting] = useState(false);
    const [submittingComment, setSubmittingComment] = useState(false);
    const [collapsedThreads, setCollapsedThreads] = useState({});
    const lastTapRef = useRef(0);
    const commentEndRef = useRef(null);
    const lightboxTouchRef = useRef({ startX: 0, startY: 0 });

    // Haptic feedback utility (mobile vibration)
    const haptic = (ms = 10) => {
      try {
        navigator?.vibrate?.(ms);
      } catch (e) {
        console.warn('[App] Handled exception:', e);
      }
    };
    const showCommentsRef = useRef(false);
    const commentsRef = useRef([]);
    const typingDebounceRef = useRef(null);

    // Format large counts as "99+"
    const fmtCount = (n) => (n > 99 ? '99+' : n);

    // Lightbox: Escape key to close + Arrow keys to navigate
    useEffect(() => {
      if (!lightboxUrl) return;
      const handler = (e) => {
        if (e.key === 'Escape') {
          setLightboxUrl(null);
          setLightboxImages([]);
        }
        if (e.key === 'ArrowRight' && lightboxImages.length > 1) {
          const next = (lightboxIndex + 1) % lightboxImages.length;
          setLightboxIndex(next);
          setLightboxUrl(lightboxImages[next]);
        }
        if (e.key === 'ArrowLeft' && lightboxImages.length > 1) {
          const prev = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
          setLightboxIndex(prev);
          setLightboxUrl(lightboxImages[prev]);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [lightboxUrl, lightboxImages, lightboxIndex]);

    // Auto-scroll to newest comment when comments change
    useEffect(() => {
      if (showComments && comments.length > 0) {
        commentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, [comments.length, showComments]);

    // Keep refs in sync with state for real-time callbacks
    useEffect(() => {
      showCommentsRef.current = showComments;
    }, [showComments]);
    useEffect(() => {
      commentsRef.current = comments;
    }, [comments]);

    // 📡 Real-time sync for Likes & Comments (Broadcast from WebSocket)
    useEffect(() => {
      if (!post.id) return;
      const cleanupLike = eventBus.on('SOCIAL_LIKE_UPDATE', (payload) => {
        if (payload?.postId === post.id) {
          setLikeCount((prev) => Math.max(0, prev + payload.delta));
        }
      });
      const cleanupComment = eventBus.on('SOCIAL_COMMENT_UPDATE', (payload) => {
        if (payload?.postId === post.id) {
          if (payload.removed) {
            setCommentCount((prev) => Math.max(0, prev - 1));
            return; // No injection needed for deletions
          }
          setCommentCount((prev) => prev + 1);
          // If comments are visible, inject the new comment in real-time
          if (showCommentsRef.current && payload.commentId) {
            const alreadyHave = commentsRef.current.some((c) => c.id === payload.commentId);
            if (!alreadyHave) {
              // Fetch author profile for the new comment
              (async () => {
                try {
                  const { data: author } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .eq('id', payload.authorId)
                    .maybeSingle();
                  setComments((prev) => {
                    if (prev.some((c) => c.id === payload.commentId)) return prev;
                    return [
                      ...prev,
                      {
                        id: payload.commentId,
                        text: payload.content || '',
                        authorId: payload.authorId,
                        parentId: payload.parentId || null,
                        authorName: author?.username || author?.full_name || 'Player',
                        authorAvatar: author?.avatar_url || null,
                        authorUsername: author?.username || null,
                        time: 'Just now',
                        likeCount: 0,
                        isLikedByMe: false,
                        mediaUrl: payload.mediaUrl || null,
                        mediaType: payload.mediaType || null,
                      },
                    ];
                  });
                } catch (e) {
                  console.warn('[Social] Real-time comment inject failed:', e.message);
                }
              })();
            }
          }
        }
      });
      const cleanupTyping = eventBus.on('SOCIAL_TYPING_UPDATE', (payload) => {
        if (payload?.postId === post.id) {
          setTypists((prev) => {
            const next = { ...prev };
            if (payload.isTyping) {
              next[payload.userId] = { name: payload.name, avatar: payload.avatar, ts: Date.now() };
            } else {
              delete next[payload.userId];
            }
            return next;
          });
        }
      });

      // Auto-clear stale typists after 10s fallback
      const typeInterval = setInterval(() => {
        setTypists((prev) => {
          const now = Date.now();
          let changed = false;
          const next = { ...prev };
          for (const uid in next) {
            if (now - next[uid].ts > 10000) {
              delete next[uid];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }, 5000);

      return () => {
        if (cleanupLike) cleanupLike();
        if (cleanupComment) cleanupComment();
        if (cleanupTyping) cleanupTyping();
        clearInterval(typeInterval);
        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      };
    }, [post.id]);

    const handleBookmark = async () => {
      if (!currentUserId) return;
      const newBookmarked = !bookmarked;
      setBookmarked(newBookmarked);
      setBookmarkCount((prev) => (newBookmarked ? prev + 1 : Math.max(0, prev - 1)));
      haptic(newBookmarked ? 15 : 5);
      try {
        if (newBookmarked) {
          // social_interactions has no UNIQUE constraint, so upsert fails.
          // Delete-then-insert pattern: idempotent without needing a DB migration.
          await supabase
            .from('social_interactions')
            .delete()
            .eq('post_id', post.id)
            .eq('user_id', currentUserId)
            .eq('interaction_type', 'bookmark');
          const { error } = await supabase
            .from('social_interactions')
            .insert({ post_id: post.id, user_id: currentUserId, interaction_type: 'bookmark' });
          if (error) throw error;
          toast.success('Post saved');
        } else {
          const { error } = await supabase
            .from('social_interactions')
            .delete()
            .eq('post_id', post.id)
            .eq('user_id', currentUserId)
            .eq('interaction_type', 'bookmark');
          if (error) throw error;
          toast.success('Removed from saved');
        }
      } catch (e) {
        console.warn('Bookmark error:', e);
        setBookmarked(!newBookmarked);
        setBookmarkCount((prev) => (newBookmarked ? Math.max(0, prev - 1) : prev + 1));
        toast.error('Could not save post');
      }
    };

    const likeDebounceRef = useRef(false);
    const handleLike = async (reactionType) => {
      // Debounce: prevent rapid-fire like clicks
      if (likeDebounceRef.current) return;
      likeDebounceRef.current = true;
      setTimeout(() => {
        likeDebounceRef.current = false;
      }, 300);
      haptic(reactionType ? 12 : 5);

      // 3 cases: (1) new like, (2) unlike, (3) change reaction on existing like
      const isUnlike = !reactionType;
      const isChangeReaction = liked && !isUnlike; // already liked, picking a new reaction
      const newLiked = !isUnlike;
      const prevLiked = liked;
      const prevLikeCount = likeCount;
      const prevReactions = [...reactions];

      if (isChangeReaction) {
        // Just swap the reaction type, no count change
        setReactions((prev) => {
          const updated = [...prev];
          if (updated.length > 0) updated[updated.length - 1] = reactionType;
          else updated.push(reactionType);
          return updated;
        });
      } else if (newLiked) {
        setLiked(true);
        setLikeCount((prev) => prev + 1);
        setReactions((prev) => [...prev, reactionType]);
      } else {
        setLiked(false);
        setLikeCount((prev) => Math.max(0, prev - 1));
        const idx = reactions.findIndex((r) => r);
        if (idx > -1) {
          const updated = [...reactions];
          updated.splice(idx, 1);
          setReactions(updated);
        }
      }
      try {
        await onLike(post.id, reactionType || null);
      } catch (e) {
        // Revert optimistic UI to pre-click snapshot on any DB/network failure
        setLiked(prevLiked);
        setLikeCount(prevLikeCount);
        setReactions(prevReactions);
        toast.error('Could not save reaction, please try again');
        console.warn('[PostCard] handleLike error (reverted):', e?.message || e);
      }
    };

    const loadComments = async (offset = 0) => {
      // Only skip when paginating forward AND we already have those pages
      // On offset=0 (re-open), always re-fetch to avoid stale data
      setLoadingComments(true);
      try {
        // Step 1: Fetch comments and embedded likes
        const COMMENT_PAGE_SIZE = 50;
        const { data: commentsData, error: commentsError } = await supabase
          .from('social_comments')
          .select(
            'id, content, created_at, author_id, parent_id, media_url, media_type, social_comment_likes(id, user_id)'
          )
          .eq('post_id', post.id)
          .order('created_at', { ascending: true })
          .range(offset, offset + COMMENT_PAGE_SIZE - 1);

        if (commentsError) {
          console.warn('[Comments] Error fetching comments:', commentsError);
          setLoadingComments(false);
          return;
        }

        if (!commentsData || commentsData.length === 0) {
          if (offset === 0) setComments([]);
          setHasMoreComments(false);
          setLoadingComments(false);
          return;
        }

        // Track if there might be more comments
        setHasMoreComments(commentsData.length === COMMENT_PAGE_SIZE);

        // Step 2: Fetch author profiles for all comments
        const authorIds = [...new Set(commentsData.map((c) => c.author_id).filter(Boolean))];
        let profilesMap = {};

        if (authorIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', authorIds);

          if (profilesData) {
            profilesData.forEach((p) => {
              profilesMap[p.id] = p;
            });
          }
        }

        // Step 3: Combine comments with author profiles and likes
        const newComments = commentsData.map((c) => {
          const author = profilesMap[c.author_id] || {};
          const likes = c.social_comment_likes || [];
          return {
            id: c.id,
            text: c.content,
            authorId: c.author_id,
            parentId: c.parent_id || null,
            authorName: author.username || author.full_name || 'Player',
            authorAvatar: author.avatar_url || null,
            authorUsername: author.username || null,
            time: timeAgo(c.created_at),
            likeCount: likes.length,
            isLikedByMe: likes.some((like) => like.user_id === currentUserId),
            mediaUrl: c.media_url || null,
            mediaType: c.media_type || null,
          };
        });
        setComments((prev) => (offset === 0 ? newComments : [...prev, ...newComments]));
      } catch (e) {
        console.warn('[Comments] Error loading comments:', e);
      }
      setLoadingComments(false);
    };

    const loadMoreComments = () => {
      loadComments(comments.length);
    };

    // Phase 3: Double-tap to like handler
    const handleDoubleTap = useCallback(() => {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double tap detected — trigger like + heart animation + haptic
        if (!liked) handleLike('like');
        setDoubleTapHeart(true);
        haptic(20);
        setTimeout(() => setDoubleTapHeart(false), 800);
      }
      lastTapRef.current = now;
    }, [liked, handleLike]);

    const handleToggleComments = () => {
      setShowComments(!showComments);
      if (!showComments) {
        loadComments();
        // Auto-focus comment input after opening
        setTimeout(() => commentInputRef.current?.focus(), 200);
      }
    };

    const handleLikeComment = async (commentId, isCurrentlyLiked) => {
      if (!currentUserId) return;

      // Optimistic update
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              isLikedByMe: !isCurrentlyLiked,
              likeCount: isCurrentlyLiked ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
            };
          }
          return c;
        })
      );

      try {
        if (!isCurrentlyLiked) {
          const { error } = await supabase.from('social_comment_likes').insert({
            comment_id: commentId,
            user_id: currentUserId,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('social_comment_likes')
            .delete()
            .eq('comment_id', commentId)
            .eq('user_id', currentUserId);
          if (error) throw error;
        }
      } catch (e) {
        console.warn('[Comments] Error liking comment:', e);
        // Revert optimistic update on failure
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === commentId) {
              return {
                ...c,
                isLikedByMe: isCurrentlyLiked,
                likeCount: isCurrentlyLiked ? c.likeCount + 1 : Math.max(0, c.likeCount - 1),
              };
            }
            return c;
          })
        );
      }
    };

    // Typing indicator animation component
    const TypingDot = ({ delay }) => (
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: C.textSec,
          margin: '0 2px',
          animation: `sp-bounce 1.4s infinite ease-in-out both`,
          animationDelay: delay,
        }}
      ></span>
    );

    const handleSubmitComment = async () => {
      if ((!newComment.trim() && !commentMediaUrl) || !currentUserId || submittingComment) return;
      setSubmittingComment(true);

      // Stop typing indicator immediately on submit
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      try {
        supabase
          .channel('social-feed')
          .send({
            type: 'broadcast',
            event: 'typing',
            payload: {
              post_id: post.id,
              user_id: currentUserId,
              name: currentUserName,
              avatar_url: currentUserAvatar,
              isTyping: false,
            },
          })
          .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
      } catch (e) {
        console.warn('[App] Handled exception:', e);
      }

      // Capture values and clear input immediately for snappy UX
      const commentText = newComment.trim();
      const parentInfo = replyingTo;
      const mediaUrl = commentMediaUrl;
      const mediaType = commentMediaType;
      setNewComment('');
      setReplyingTo(null);
      setCommentMediaUrl(null);
      setCommentMediaType(null);
      setShowCommentGifPicker(false);

      // Optimistic insert: show comment instantly with a temporary ID
      const tempId = `temp-${Date.now()}`;
      const optimisticComment = {
        id: tempId,
        text: commentText,
        parentId: parentInfo?.id || null,
        authorName: currentUserName || 'You',
        authorId: currentUserId,
        authorAvatar: currentUserAvatar,
        time: 'Just now',
        likeCount: 0,
        isLikedByMe: false,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
      };
      setComments((prev) => [...prev, optimisticComment]);
      setCommentCount((prev) => prev + 1);
      if (onComment) onComment(post.id);

      try {
        const payload = { post_id: post.id, author_id: currentUserId, content: commentText || '' };
        if (parentInfo) payload.parent_id = parentInfo.id;
        if (mediaUrl) {
          payload.media_url = mediaUrl;
          payload.media_type = mediaType;
        }

        const { data, error } = await supabase
          .from('social_comments')
          .insert(payload)
          .select('id, content, created_at, parent_id')
          .maybeSingle();
        if (!error && data) {
          // Replace optimistic entry with real server data
          setComments((prev) =>
            prev.map((c) =>
              c.id === tempId
                ? {
                    ...c,
                    id: data.id,
                    parentId: data.parent_id || null,
                  }
                : c
            )
          );

          // Emit EventBus for cross-component comment count updates
          busEmit.socialCommentAdded(post.id, currentUserId);

          // Secondary operations: notifications (isolated — failure must NOT affect comment UX)
          try {
            // Trigger reply notification
            if (parentInfo && parentInfo.authorId !== currentUserId) {
              await supabase.from('notifications').insert({
                user_id: parentInfo.authorId,
                type: 'reply',
                message: `replied to your comment`,
                data: { actor_id: currentUserId, reference_id: post.id },
              });
            }

            // Phase 28 Fix: Trigger mention notifications
            const mentions = commentText.match(/@([\w.]+)/g);
            if (mentions && mentions.length > 0) {
              const usernames = mentions.map((m) => m.slice(1));
              const { data: mentionedUsers } = await supabase
                .from('profiles')
                .select('id, username')
                .in('username', usernames);
              if (mentionedUsers && mentionedUsers.length > 0) {
                // Filter out self-mentions — don't notify yourself
                const notifications = mentionedUsers
                  .filter((u) => u.id !== currentUserId)
                  .map((u) => ({
                    user_id: u.id,
                    type: 'mention',
                    message: `mentioned you in a comment`,
                    data: { actor_id: currentUserId, reference_id: post.id },
                  }));
                if (notifications.length > 0) {
                  await supabase.from('notifications').insert(notifications);
                }
              }
            }
          } catch (notifErr) {
            console.warn('[App] Handled exception:', notifErr?.message || notifErr);
          }
        } else {
          // DB insert returned error — rollback optimistic entry
          setComments((prev) => prev.filter((c) => c.id !== tempId));
          setCommentCount((prev) => Math.max(0, prev - 1));
          console.warn('[Social] Comment insert error:', error);
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
      setSubmittingComment(false);
    };

    return (
      <div
        style={{
          background: C.card,
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          marginBottom: 2,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            href={`/hub/user/${post.author?.username || 'player'}`}
            style={{ textDecoration: 'none', position: 'relative', display: 'inline-block' }}
          >
            <Avatar src={post.author?.avatar} name={post.author?.name} size={40} />
            {horseProfileIds.has(post.authorId) && isHorseOnlineNow(post.authorId) && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 12,
                  height: 12,
                  background: '#31a24c',
                  border: '2px solid white',
                  borderRadius: '50%',
                }}
              />
            )}
          </Link>
          <div style={{ flex: 1 }}>
            <Link
              href={`/hub/user/${post.author?.username || 'player'}`}
              style={{ fontWeight: 600, color: C.text, textDecoration: 'none' }}
            >
              {post.author?.name || 'Player'}
            </Link>
            <div style={{ fontSize: 12, color: C.textSec }}>
              {post.timeAgo}
              {post.visibility !== 'private' ? ' · 🌐' : ' · 🔒'}
              {post.viewCount > 0
                ? ` · ${post.viewCount > 999 ? (post.viewCount / 1000).toFixed(1) + 'k' : post.viewCount} view${post.viewCount !== 1 ? 's' : ''}`
                : ''}
            </div>
          </div>
          {(post.authorId === currentUserId || post.isGodMode) && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {post.authorId !== currentUserId && post.isGodMode && (
                <span
                  style={{
                    fontSize: 10,
                    background: '#FFD700',
                    color: '#000',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  {' '}
                  GOD
                </span>
              )}
              {post.authorId === currentUserId && !editing && (
                <button
                  onClick={() => {
                    setEditing(true);
                    setEditContent(displayContent || '');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: C.textSec,
                    fontSize: 14,
                  }}
                  title="Edit post"
                >
                  ✎
                </button>
              )}
              <button
                onClick={() => onDelete(post.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.textSec,
                  fontSize: 16,
                }}
              ></button>
            </div>
          )}
          {post.authorId !== currentUserId && currentUserId && (
            <>
              <button
                onClick={async () => {
                  if (isReporting) return;
                  setIsReporting(true);
                  try {
                    await supabase
                      .from('social_interactions')
                      .delete()
                      .eq('post_id', post.id)
                      .eq('user_id', currentUserId)
                      .eq('interaction_type', 'report');
                    const { error } = await supabase.from('social_interactions').insert({
                      post_id: post.id,
                      user_id: currentUserId,
                      interaction_type: 'report',
                    });
                    if (error) throw error;
                    toast.success('Post reported. We will review it shortly.');
                  } catch (e) {
                    console.warn('[Social] Report failed:', e.message || e);
                    toast.error('Could not report post');
                  }
                  setIsReporting(false);
                }}
                disabled={isReporting}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: isReporting ? 'wait' : 'pointer',
                  color: C.textSec,
                  fontSize: 12,
                  opacity: isReporting ? 0.3 : 0.6,
                }}
                title="Report this post"
              >
                {isReporting ? '...' : '⚠'}
              </button>
              {onBlock && (
                <button
                  onClick={() => onBlock(post.authorId, post.author?.name)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: C.textSec,
                    fontSize: 11,
                    opacity: 0.5,
                  }}
                  title="Hide posts from this user"
                >
                  🚫
                </button>
              )}
            </>
          )}
        </div>
        {editing ? (
          <div
            style={{
              padding: '0 12px 12px',
              transition: 'opacity 0.2s ease',
              animationName: 'sp-fade-in',
              animationDuration: '0.2s',
            }}
          >
            {post.isClubPagePost && (
              <div
                style={{
                  fontSize: 11,
                  color: '#1877F2',
                  marginBottom: 6,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#1877F2',
                    display: 'inline-block',
                  }}
                />
                Editing as {post.author?.name || 'Club Page'} - club branding preserved
              </div>
            )}
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
              style={{
                width: '100%',
                minHeight: 60,
                padding: 8,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 15,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditing(false)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  border: `1px solid ${C.border}`,
                  background: 'transparent',
                  color: C.textSec,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const { error } = await supabase
                      .from('social_posts')
                      .update({ content: editContent.trim() })
                      .eq('id', post.id)
                      .eq('author_id', currentUserId);
                    if (error) throw error;
                    setDisplayContent(editContent.trim());
                    setEditing(false);
                    toast.success('Post updated');
                    // Notify other tabs/components of the edit
                    busEmit.dataMutated?.('social_posts');
                    broadcastSync('smarter_poker_social_sync', {
                      action: 'refresh_feed',
                      tabId: BROADCAST_TAB_ID,
                    });
                  } catch (e) {
                    toast.error('Could not update post');
                    console.warn('[Social] Edit error:', e);
                  }
                }}
                disabled={!editContent.trim()}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  border: 'none',
                  background: C.blue,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: editContent.trim() ? 1 : 0.5,
                }}
              >
                Save
              </button>
            </div>
            <style>{`@keyframes sp-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          </div>
        ) : (
          displayContent && (
            <div style={{ padding: '0 12px 12px', color: C.text, fontSize: 15, lineHeight: 1.4 }}>
              {(() => {
                // For link-type posts, strip URLs from displayed content (SmarterPoker-style)
                let displayText = displayContent;
                if (post.contentType === 'link' || post.contentType === 'video') {
                  displayText = displayText
                    .replace(/https?:\/\/[^\s]+/gi, '')
                    .replace(/🔗\s*/g, '')
                    .trim();
                }

                // If content is empty after stripping URL, don't render this block
                if (!displayText) return null;

                // See More: truncate at 300 chars unless expanded
                const TRUNCATE_LENGTH = 300;
                const needsTruncation = displayText.length > TRUNCATE_LENGTH && !expanded;
                const visibleText = needsTruncation
                  ? displayText.slice(0, TRUNCATE_LENGTH) + '...'
                  : displayText;

                // Render with @mention highlighting
                const rendered = visibleText.split(/(@\w+)/g).map((part, i) =>
                  part.startsWith('@') ? (
                    <span key={i} style={{ color: C.blue, fontWeight: 500, cursor: 'pointer' }}>
                      {part}
                    </span>
                  ) : (
                    part
                  )
                );
                return (
                  <>
                    {rendered}
                    {needsTruncation && (
                      <span
                        onClick={() => setExpanded(true)}
                        style={{
                          color: C.textSec,
                          cursor: 'pointer',
                          fontWeight: 600,
                          marginLeft: 4,
                        }}
                      >
                        See more
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )
        )}
        {/* 📍 Check-in venue badge — shown on posts with "Checked in at" content */}
        {post.content &&
          /^Checked in at /i.test(post.content) &&
          (() => {
            const match = post.content.match(/^Checked in at (.+?)(?:\s*[—–]\s*(.+))?$/i);
            const venueName =
              match?.[1] ||
              post.content
                .replace(/^Checked in at /i, '')
                .split('—')[0]
                .trim();
            const locationText = match?.[2]?.trim() || '';
            return (
              <div
                style={{
                  margin: '0 12px 10px',
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #E7F3FF 0%, #F0F7FF 100%)',
                  border: '1px solid #B8D4F0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1877F2' }}>{venueName}</div>
                  {locationText && (
                    <div style={{ fontSize: 11, color: '#65676B', marginTop: 1 }}>
                      {locationText}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        {/* Media Grid - supports up to 10 images/videos.
                Live-type posts always render their card even with empty media_urls (thumbnail may be missing). */}
        {(post.mediaUrls?.length > 0 ||
          post.contentType === 'live' ||
          post.contentType?.startsWith('live_session')) && (
          <div style={{ padding: (post.mediaUrls?.length ?? 0) > 1 ? '0 2px 2px' : 0 }}>
            {/* Double-tap to like + heart animation overlay */}
            <div onClick={handleDoubleTap} style={{ position: 'relative', cursor: 'pointer' }}>
              {doubleTapHeart && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 5,
                    fontSize: 64,
                    pointerEvents: 'none',
                    animation: 'sp-heart-pop 0.8s ease forwards',
                  }}
                >
                  ❤️
                </div>
              )}
              <style>{`@keyframes sp-heart-pop { 0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); } 40% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.4); } }`}</style>
              {(post.mediaUrls?.length ?? 0) <= 1 ? (
                // Single media or no-media live card - full width
                post.contentType === 'live' ? (
                  // BUG-FIX-LIVE-2 (per Dan: "VIDEO IS NOT PLAYING ON THE
                  // SOCIAL FEED, ITS STILL JUST A STATIC IMAGE INSTEAD OF
                  // THE LIVE VIDEO FOR USERS TO CLICK AND WATCH"):
                  // delegates to LiveStreamCard with `inlineAutoplay`
                  // so the LiveKit preview track mounts immediately
                  // (no hover required — hover doesn't fire on touch).
                  // The Watch Now overlay is preserved. Ended streams
                  // keep the static tile (no live track to subscribe).
                  (() => {
                    const isEnded = post.metadata?.ended === true;
                    const streamId = post.metadata?.stream_id;
                    const handleOpen = () => {
                      if (!streamId) return;
                      if (isEnded) {
                        toast.info('This stream has ended');
                        return;
                      }
                      router.push(`/hub/social-media?stream=${streamId}`);
                    };
                    if (isEnded || !streamId) {
                      return (
                        <div
                          onClick={handleOpen}
                          style={{
                            position: 'relative',
                            cursor: 'default',
                            background: '#000',
                            borderRadius: 8,
                            overflow: 'hidden',
                            aspectRatio: '16/9',
                          }}
                        >
                          {post.mediaUrls?.[0] && (
                            <img
                              src={post.mediaUrls[0]}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: 0.4,
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          )}
                          <div
                            style={{
                              position: 'absolute',
                              top: 12,
                              left: 12,
                              background: '#65676B',
                              color: 'white',
                              padding: '4px 12px',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 800,
                              letterSpacing: 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: 'white',
                                display: 'inline-block',
                              }}
                            />
                            STREAM ENDED
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div style={{ position: 'relative' }}>
                        <LiveStreamCard
                          stream={{
                            id: streamId,
                            thumbnail_url:
                              post.thumbnail_url ||
                              post.thumbnailUrl ||
                              post.mediaUrls?.[0] ||
                              null, // Bug26/27: prefer thumbnail_url over first media frame
                            title: post.content || '',
                          }}
                          inlineAutoplay
                          onClick={handleOpen}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 12,
                            left: 12,
                            background: '#FF0000',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: 1,
                            animation: 'sp-live-pulse 1.5s ease-in-out infinite',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            pointerEvents: 'none',
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'white',
                              display: 'inline-block',
                            }}
                          />
                          LIVE NOW
                        </div>
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                            padding: '32px 16px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            style={{
                              background: C.blue,
                              color: 'white',
                              padding: '10px 28px',
                              borderRadius: 24,
                              fontSize: 15,
                              fontWeight: 700,
                              boxShadow: '0 4px 12px rgba(24,119,242,0.4)',
                            }}
                          >
                            Watch Now
                          </div>
                        </div>
                        <style>{`@keyframes sp-live-pulse { 0%, 100% { box-shadow: 0 0 8px rgba(255,0,0,0.4); } 50% { box-shadow: 0 0 20px rgba(255,0,0,0.8); } }`}</style>
                      </div>
                    );
                  })()
                ) : post.contentType?.startsWith('live_session') ? (
                  // LIVE SESSION ("I'm at the table")
                  (() => {
                    const isEnded = post.contentType === 'live_session_ended';
                    return (
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #182848, #4b6cb7)',
                          padding: '24px 20px',
                          color: 'white',
                          borderRadius: 8,
                          margin: '8px 12px 16px',
                          position: 'relative',
                          overflow: 'hidden',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        }}
                      >
                        {/* Glowing orb effect */}
                        {!isEnded && (
                          <div
                            style={{
                              position: 'absolute',
                              top: -20,
                              right: -20,
                              width: 100,
                              height: 100,
                              background:
                                'radial-gradient(circle, rgba(0,255,136,0.2) 0%, rgba(0,0,0,0) 70%)',
                              borderRadius: '50%',
                            }}
                          />
                        )}

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: isEnded ? '#65676B' : '#00E676',
                              boxShadow: isEnded ? 'none' : '0 0 10px #00E676',
                              animation: isEnded ? 'none' : 'sp-pulse-green 2s infinite',
                            }}
                          />
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: 1,
                              color: isEnded ? '#B0B3B8' : '#00E676',
                            }}
                          >
                            {isEnded ? 'SESSION ENDED' : 'AT THE TABLE NOW'}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 800,
                            marginBottom: 4,
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                          }}
                        >
                          {post.metadata?.venue_name || 'Live Poker'}
                        </div>
                        <div
                          style={{
                            fontSize: 15,
                            color: 'rgba(255,255,255,0.85)',
                            marginBottom: 16,
                          }}
                        >
                          {post.metadata?.game_type || 'NLH'} • {post.metadata?.stakes || '$1/$2'}
                        </div>

                        {post.metadata?.current_profit !== undefined &&
                          post.metadata?.current_profit !== 0 && (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: 'rgba(0,0,0,0.3)',
                                padding: '6px 12px',
                                borderRadius: 20,
                                fontSize: 14,
                                fontWeight: 600,
                                color: post.metadata.current_profit > 0 ? '#00E676' : '#FF5252',
                              }}
                            >
                              <span>
                                Session {post.metadata.current_profit > 0 ? 'Win' : 'Loss'}:
                              </span>
                              <span>
                                {post.metadata.current_profit > 0 ? '+' : '-'}$
                                {Math.abs(post.metadata.current_profit)}
                              </span>
                            </div>
                          )}

                        {post.metadata?.notes && (
                          <div
                            style={{
                              marginTop: 12,
                              fontSize: 14,
                              fontStyle: 'italic',
                              color: 'rgba(255,255,255,0.7)',
                              borderLeft: '3px solid rgba(255,255,255,0.2)',
                              paddingLeft: 12,
                            }}
                          >
                            "{post.metadata.notes}"
                          </div>
                        )}
                        <style>{`@keyframes sp-pulse-green { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 230, 118, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(0, 230, 118, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 230, 118, 0); } }`}</style>
                      </div>
                    );
                  })()
                ) : post.contentType === 'video' ? (
                  // FEED-VIDEO-POSTER-2026-05-07 — supersedes the prior
                  // FEED-VIDEO-THUMBNAIL-FIX-2026-05-06 inline branch.
                  //
                  // The previous inline branch had two failure modes that
                  // both rendered as "black + play button":
                  //   1. <img background:#000 alt=""> hides image-load
                  //      failures (404 / CORS / slow CDN) as a black box
                  //      with no broken-image icon — user can't tell it
                  //      failed.
                  //   2. <video src + #t=0.001> fallback was supposed to
                  //      decode first frame, but iOS Safari refuses to
                  //      decode without playback → black <video>.
                  // VideoPostWrapper above always overlays a play button,
                  // so both modes look identical to the user.
                  //
                  // FeedVideoPoster wraps both branches with onError
                  // fallthrough + IntersectionObserver autoplay so the
                  // iOS first-frame trick actually works. See the source
                  // comment in SharedVideoComponents.jsx for the full
                  // root-cause writeup.
                  <VideoPostWrapper
                    url={post.mediaUrls[0]}
                    onValidVideoClick={() => router.push(`/hub/reels?id=${post.id}`)}
                  >
                    <FeedVideoPoster
                      videoUrl={post.mediaUrls[0]}
                      thumbnailUrl={post.thumbnail_url || post.thumbnailUrl || null}
                    />
                  </VideoPostWrapper>
                ) : post.contentType === 'link' || post.contentType === 'article' ? (
                  // LINK/ARTICLE: Use centralized ArticleCard component
                  <ArticleCard
                    url={
                      post.link_url ||
                      (() => {
                        const match = post.content?.match(/https?:\/\/[^\s"'<>]+/);
                        return match ? match[0] : null;
                      })()
                    }
                    title={post.link_title}
                    description={post.link_description}
                    image={post.link_image || post.mediaUrls?.[0]}
                    siteName={post.link_site_name}
                    fallbackContent={post.content}
                    onClick={onOpenArticle}
                  />
                ) : (
                  <img
                    src={post.mediaUrls[0]}
                    loading="lazy"
                    alt=""
                    style={{
                      maxWidth: '100%',
                      display: 'block',
                      margin: '0 auto',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setLightboxImages(post.mediaUrls);
                      setLightboxIndex(0);
                      setLightboxUrl(post.mediaUrls[0]);
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )
              ) : post.mediaUrls.length === 2 ? (
                // 2 media - side by side
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {post.mediaUrls.map((url, i) => (
                    <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                      {post.contentType === 'video' && i === 0 ? (
                        // FEED-VIDEO-POSTER-2026-05-07: same self-healing tile
                        // as the 1-up branch — see comment there and in
                        // SharedVideoComponents.jsx for root-cause details.
                        // Wrapper div has pointerEvents: none so the
                        // IntersectionObserver autoplay <video> doesn't
                        // capture taps meant for the parent.
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            cursor: 'pointer',
                            position: 'relative',
                            background: '#000',
                          }}
                          onClick={() => router.push(`/hub/reels?id=${post.id}`)}
                        >
                          <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                            <FeedVideoPoster
                              videoUrl={url}
                              thumbnailUrl={post.thumbnail_url || post.thumbnailUrl || null}
                            />
                          </div>
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                background: 'rgba(0,0,0,0.6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                <polygon points="5,3 19,12 5,21" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={url}
                          loading="lazy"
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            setLightboxImages(post.mediaUrls);
                            setLightboxIndex(post.mediaUrls.indexOf(url));
                            setLightboxUrl(url);
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : post.mediaUrls.length === 3 ? (
                // 3 media - 1 large + 2 small
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
                  <div style={{ aspectRatio: '1', overflow: 'hidden' }}>
                    <img
                      src={post.mediaUrls[0]}
                      loading="lazy"
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        cursor: 'pointer',
                      }}
                      onClick={() => setLightboxUrl(post.mediaUrls[0])}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {post.mediaUrls.slice(1).map((url, i) => (
                      <div key={i} style={{ flex: 1, overflow: 'hidden' }}>
                        <img
                          src={url}
                          loading="lazy"
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            setLightboxImages(post.mediaUrls);
                            setLightboxIndex(post.mediaUrls.indexOf(url));
                            setLightboxUrl(url);
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : post.mediaUrls.length === 4 ? (
                // 4 media - 2x2 grid
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {post.mediaUrls.map((url, i) => (
                    <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                      <img
                        src={url}
                        loading="lazy"
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setLightboxImages(post.mediaUrls);
                          setLightboxIndex(post.mediaUrls.indexOf(url));
                          setLightboxUrl(url);
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                // 5+ media - 2 large + rest in row with +N overlay
                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 2,
                      marginBottom: 2,
                    }}
                  >
                    {post.mediaUrls.slice(0, 2).map((url, i) => (
                      <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                        <img
                          src={url}
                          loading="lazy"
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            setLightboxImages(post.mediaUrls);
                            setLightboxIndex(post.mediaUrls.indexOf(url));
                            setLightboxUrl(url);
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                    {post.mediaUrls.slice(2, 5).map((url, i) => (
                      <div
                        key={i}
                        style={{ aspectRatio: '1', overflow: 'hidden', position: 'relative' }}
                      >
                        <img
                          src={url}
                          loading="lazy"
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            setLightboxImages(post.mediaUrls);
                            setLightboxIndex(post.mediaUrls.indexOf(url));
                            setLightboxUrl(url);
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        {i === 2 && post.mediaUrls.length > 5 && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: 24,
                              fontWeight: 600,
                            }}
                          >
                            +{post.mediaUrls.length - 5}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* 🔗 LINK PREVIEW for posts with link_url but NO media_urls (ghost fleet posts) */}
        {(!post.mediaUrls || post.mediaUrls.length === 0) && post.link_url && (
          <ArticleCard
            url={post.link_url}
            title={post.link_title}
            description={post.link_description}
            image={post.link_image}
            siteName={post.link_site_name}
            fallbackContent={post.content}
            onClick={onOpenArticle}
          />
        )}
        <div
          style={{
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            color: C.textSec,
            fontSize: 13,
          }}
        >
          <span>
            {likeCount > 0 &&
              (() => {
                // Phase 24 Actual Breakdown: Aggregate true reactions and show top 3
                if (reactions.length === 0) return `👍 ${likeCount}`;

                const counts = {};
                reactions.forEach((r) => {
                  counts[r] = (counts[r] || 0) + 1;
                });

                // Sort descending by count
                const sortedReactions = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);

                const emojiMap = {
                  like: '👍',
                  love: '❤️',
                  haha: '😂',
                  wow: '😮',
                  sad: '😢',
                  angry: '😡',
                  fire: '🔥', // legacy — kept for backwards compat
                };

                // Get up to 3 icons
                const icons = sortedReactions
                  .slice(0, 3)
                  .map((r) => emojiMap[r[0]] || '👍')
                  .join('');
                return `${icons} ${fmtCount(likeCount)}`;
              })()}
          </span>
          <span style={{ cursor: 'pointer', display: 'flex', gap: 12 }}>
            {commentCount > 0 && (
              <span
                onClick={handleToggleComments}
              >{`${fmtCount(commentCount)} ${commentCount === 1 ? 'comment' : 'comments'}`}</span>
            )}
            {shareCount > 0 && (
              <span>{`${fmtCount(shareCount)} ${shareCount === 1 ? 'share' : 'shares'}`}</span>
            )}
          </span>
        </div>
        {/* Action buttons row — overflow:visible so reaction picker escapes card border-radius clip */}
        <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex', overflow: 'visible' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <button
              onClick={() => {
                if (!liked) {
                  handleLike('like');
                } else {
                  handleLike(null);
                }
              }}
              onMouseEnter={() => setShowReactionPicker(true)}
              onMouseLeave={() => setShowReactionPicker(false)}
              style={{
                width: '100%',
                padding: 10,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: liked ? C.blue : C.textSec,
                fontWeight: 500,
                fontSize: 13,
              }}
              aria-label={liked ? 'Unlike this post' : 'Like this post'}
            >
              {liked ? '👍 Liked' : '👍 Like'}
            </button>
            {showReactionPicker && (
              <style>{`@keyframes reactionFadeUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            )}
            {showReactionPicker && (
              <div
                onMouseEnter={() => setShowReactionPicker(true)}
                onMouseLeave={() => setShowReactionPicker(false)}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0, // anchor to left edge of Like button — no viewport clip
                  whiteSpace: 'nowrap', // never wrap onto second line
                  background: C.card,
                  borderRadius: 24,
                  padding: '6px 10px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                  display: 'flex',
                  gap: 2,
                  zIndex: 9999,
                  border: `1px solid ${C.border}`,
                  animation: 'reactionFadeUp 0.15s ease',
                }}
              >
                {[
                  ['like', '👍'],
                  ['love', '❤️'],
                  ['haha', '😂'],
                  ['wow', '😮'],
                  ['sad', '😢'],
                  ['angry', '😡'],
                ].map(([type, emoji]) => (
                  <button
                    key={type}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLike(type);
                      setShowReactionPicker(false);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 24,
                      padding: '4px 6px',
                      borderRadius: 8,
                      transition: 'transform 0.15s',
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.35)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    title={type.charAt(0).toUpperCase() + type.slice(1)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleToggleComments}
            aria-label="Toggle comments"
            style={{
              flex: 1,
              padding: 10,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: showComments ? C.blue : C.textSec,
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {' '}
            Comment
          </button>
          <button
            onClick={() => {
              if (onShare)
                onShare({ ...post, shareCount }, () => {
                  setShareCount((s) => s + 1);
                  setHasShared(true);
                });
            }}
            style={{
              flex: 1,
              padding: 10,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: hasShared ? C.blue : C.textSec,
              fontWeight: 500,
              fontSize: 13,
            }}
            aria-label="Share this post"
          >
            ↗️ {hasShared ? 'Shared' : 'Share'}
          </button>
          <button
            onClick={handleBookmark}
            style={{
              flex: 1,
              padding: 10,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: bookmarked ? '#FFB800' : C.textSec,
              fontWeight: 500,
              fontSize: 13,
            }}
            aria-label={bookmarked ? 'Remove from saved' : 'Save this post'}
          >
            {bookmarked ? '' : ''} Save{bookmarkCount > 0 ? ` (${bookmarkCount})` : ''}
          </button>
        </div>

        {/* Display Animated Typing Indicators (Phase 11) */}
        {Object.values(typists || {}).length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              padding: '0 12px',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', position: 'relative', width: 24, height: 24 }}>
              {Object.values(typists || {})
                .slice(0, 3)
                .map((t, i) => (
                  <img
                    key={i}
                    src={t.avatar || '/default-avatar.png'}
                    alt="typing"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid white',
                      position: 'absolute',
                      left: i * 12,
                      zIndex: 3 - i,
                    }}
                  />
                ))}
            </div>
            <div
              style={{
                background: C.bg,
                borderRadius: 16,
                padding: '8px 12px',
                fontSize: 12,
                color: C.textSec,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginLeft:
                  Object.values(typists || {}).length > 2
                    ? 30
                    : (Object.values(typists || {}).length - 1) * 12,
              }}
            >
              <span>{Object.values(typists || {})[0].name.split(' ')[0]} is typing</span>
              <div style={{ display: 'flex' }}>
                <TypingDot delay="-0.32s" />
                <TypingDot delay="-0.16s" />
                <TypingDot delay="0s" />
              </div>
              <style>{`@keyframes sp-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
            </div>
          </div>
        )}

        {showComments && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
            {loadingComments && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: C.border,
                        animation: 'sp-shimmer 1.5s infinite',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          width: `${60 + i * 10}%`,
                          height: 12,
                          borderRadius: 6,
                          background: C.border,
                          marginBottom: 6,
                          animation: 'sp-shimmer 1.5s infinite',
                        }}
                      />
                      <div
                        style={{
                          width: `${30 + i * 5}%`,
                          height: 10,
                          borderRadius: 5,
                          background: C.border,
                          animation: 'sp-shimmer 1.5s infinite',
                        }}
                      />
                    </div>
                  </div>
                ))}
                <style>{`@keyframes sp-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
              </div>
            )}

            {/* Separate top level comments and replies */}
            {(() => {
              const topLevel = comments.filter((c) => !c.parentId);
              const replies = comments.filter((c) => c.parentId);
              const topLevelIds = new Set(topLevel.map((c) => c.id));
              // Recover orphaned replies (where parent was deleted)
              const orphanedReplies = replies.filter((r) => !topLevelIds.has(r.parentId));
              topLevel.push(...orphanedReplies);
              const validReplies = replies.filter((r) => topLevelIds.has(r.parentId));

              const renderCommentBlock = (c, isReply = false) => {
                const isEditingComment = editingCommentId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginBottom: isReply ? 8 : 12,
                      marginTop: isReply ? 8 : 0,
                    }}
                  >
                    <Avatar src={c.authorAvatar} name={c.authorName} size={isReply ? 24 : 28} />
                    <div style={{ flex: 1 }}>
                      {isEditingComment ? (
                        <div style={{ background: C.bg, borderRadius: 12, padding: '6px 10px' }}>
                          <textarea
                            value={editCommentText}
                            onChange={(e) => setEditCommentText(e.target.value)}
                            maxLength={2000}
                            style={{
                              width: '100%',
                              border: `1px solid ${C.border}`,
                              borderRadius: 8,
                              padding: '6px 10px',
                              fontSize: 14,
                              outline: 'none',
                              resize: 'vertical',
                              minHeight: 40,
                              fontFamily: 'inherit',
                              boxSizing: 'border-box',
                            }}
                          />
                          {c.mediaUrl && (
                            <div style={{ marginTop: 6 }}>
                              <img
                                src={c.mediaUrl}
                                alt={c.mediaType === 'gif' ? 'GIF' : 'Image'}
                                style={{
                                  maxWidth: 120,
                                  maxHeight: 80,
                                  borderRadius: 6,
                                  opacity: 0.7,
                                }}
                                loading="lazy"
                              />
                              <div style={{ fontSize: 10, color: C.textSec, marginTop: 2 }}>
                                {c.mediaType === 'gif' ? 'GIF attached' : 'Image attached'}
                              </div>
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              marginTop: 6,
                              justifyContent: 'flex-end',
                            }}
                          >
                            <button
                              onClick={() => setEditingCommentId(null)}
                              style={{
                                padding: '4px 12px',
                                borderRadius: 20,
                                border: `1px solid ${C.border}`,
                                background: 'transparent',
                                color: C.textSec,
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 500,
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                if (!editCommentText.trim() && !c.mediaUrl) return;
                                const { error } = await supabase
                                  .from('social_comments')
                                  .update({ content: editCommentText.trim() })
                                  .eq('id', c.id)
                                  .eq('author_id', currentUserId);
                                if (!error) {
                                  setComments((prev) =>
                                    prev.map((cm) =>
                                      cm.id === c.id ? { ...cm, text: editCommentText.trim() } : cm
                                    )
                                  );
                                  setEditingCommentId(null);
                                } else {
                                  toast.error('Could not update comment');
                                }
                              }}
                              disabled={!editCommentText.trim() && !c.mediaUrl}
                              style={{
                                padding: '4px 12px',
                                borderRadius: 20,
                                border: 'none',
                                background: C.blue,
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                opacity: editCommentText.trim() || c.mediaUrl ? 1 : 0.5,
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: C.bg,
                            borderRadius: 12,
                            padding: '6px 10px',
                            display: 'inline-block',
                            minWidth: '80%',
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>
                            {c.authorName}
                          </div>
                          {c.text && (
                            <div style={{ fontSize: 14, color: C.text }}>
                              {renderMentions(c.text)}
                            </div>
                          )}
                          {c.mediaUrl && (
                            <div
                              style={{
                                position: 'relative',
                                display: 'inline-block',
                                marginTop: c.text ? 6 : 0,
                              }}
                            >
                              <img
                                src={c.mediaUrl}
                                alt={c.mediaType === 'gif' ? 'GIF' : 'Image'}
                                style={{
                                  maxWidth: 220,
                                  maxHeight: 180,
                                  borderRadius: 8,
                                  display: 'block',
                                  cursor: 'pointer',
                                }}
                                onClick={() => {
                                  setLightboxImages([c.mediaUrl]);
                                  setLightboxIndex(0);
                                  setLightboxUrl(c.mediaUrl);
                                }}
                                loading="lazy"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                              {c.mediaType === 'gif' && (
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: 6,
                                    left: 6,
                                    background: 'rgba(0,0,0,0.6)',
                                    color: 'white',
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '2px 5px',
                                    borderRadius: 4,
                                    letterSpacing: 0.5,
                                  }}
                                >
                                  GIF
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Comment Meta row: Time, Like, Reply, Edit, Delete, Count */}
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          paddingLeft: 10,
                          marginTop: 4,
                          fontSize: 12,
                          color: C.textSec,
                          fontWeight: 600,
                        }}
                      >
                        <span>{c.time}</span>
                        <span
                          style={{ cursor: 'pointer', color: c.isLikedByMe ? C.blue : C.textSec }}
                          onClick={() => handleLikeComment(c.id, c.isLikedByMe)}
                        >
                          Like
                        </span>
                        <span
                          style={{ cursor: 'pointer', color: C.textSec }}
                          onClick={() =>
                            setReplyingTo({
                              id: isReply ? c.parentId : c.id,
                              name: c.authorName,
                              authorId: c.authorId,
                            })
                          }
                        >
                          Reply
                        </span>
                        {c.authorId === currentUserId && !isEditingComment && (
                          <>
                            <span
                              style={{ cursor: 'pointer', color: C.textSec }}
                              onClick={() => {
                                setEditingCommentId(c.id);
                                setEditCommentText(c.text || '');
                              }}
                            >
                              Edit
                            </span>
                            {deletingCommentId === c.id ? (
                              <span
                                style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                              >
                                <span style={{ fontSize: 11, color: C.textSec }}>Delete?</span>
                                <span
                                  style={{ cursor: 'pointer', color: '#FA383E', fontWeight: 700 }}
                                  onClick={async () => {
                                    const { error } = await supabase
                                      .from('social_comments')
                                      .delete()
                                      .eq('id', c.id)
                                      .eq('author_id', currentUserId);
                                    if (!error) {
                                      setComments((prev) => prev.filter((cm) => cm.id !== c.id));
                                      setCommentCount((prev) => Math.max(0, prev - 1));
                                      eventBus.emit(
                                        'SOCIAL_COMMENT_UPDATE',
                                        { postId: post.id, removed: true },
                                        'CommentDelete'
                                      );
                                      try {
                                        await supabase.rpc('decrement_post_count', {
                                          p_post_id: post.id,
                                          p_field: 'comment_count',
                                        });
                                      } catch (e) {
                                        console.warn('[App] Handled exception:', e);
                                      }
                                    }
                                    setDeletingCommentId(null);
                                  }}
                                >
                                  Yes
                                </span>
                                <span
                                  style={{ cursor: 'pointer', color: C.textSec }}
                                  onClick={() => setDeletingCommentId(null)}
                                >
                                  No
                                </span>
                              </span>
                            ) : (
                              <span
                                style={{ cursor: 'pointer', color: '#FA383E' }}
                                onClick={() => setDeletingCommentId(c.id)}
                              >
                                Delete
                              </span>
                            )}
                          </>
                        )}
                        {c.likeCount > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            👍 {c.likeCount}
                          </span>
                        )}
                      </div>

                      {/* Render its children if it's a top-level comment AND has replies */}
                      {(() => {
                        if (isReply) return null;
                        const childReplies = validReplies.filter((r) => r.parentId === c.id);
                        if (childReplies.length === 0) return null;
                        const isCollapsed = collapsedThreads[c.id];
                        return (
                          <div
                            style={{
                              marginLeft: 36,
                              borderLeft: `2px solid ${C.border}`,
                              paddingLeft: 8,
                              marginTop: 8,
                            }}
                          >
                            <button
                              onClick={() =>
                                setCollapsedThreads((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                color: C.blue,
                                fontSize: 12,
                                cursor: 'pointer',
                                padding: '2px 0',
                                fontWeight: 600,
                                marginBottom: isCollapsed ? 0 : 4,
                              }}
                            >
                              {isCollapsed
                                ? `Show ${childReplies.length} ${childReplies.length === 1 ? 'reply' : 'replies'}`
                                : `Hide ${childReplies.length === 1 ? 'reply' : 'replies'}`}
                            </button>
                            {!isCollapsed && childReplies.map((r) => renderCommentBlock(r, true))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              };

              return topLevel.map((c) => renderCommentBlock(c, false));
            })()}

            {/* Load more comments button */}
            {hasMoreComments && !loadingComments && (
              <button
                onClick={loadMoreComments}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'none',
                  border: 'none',
                  color: C.blue,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginTop: 4,
                }}
              >
                View more comments
              </button>
            )}

            {replyingTo && (
              <div
                style={{
                  fontSize: 12,
                  color: C.textSec,
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0 40px',
                }}
              >
                <span>
                  Replying to <strong>{replyingTo.name}</strong>
                </span>
                <span
                  style={{ cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setReplyingTo(null)}
                >
                  Cancel
                </span>
              </div>
            )}
            <div ref={commentEndRef} />
            {/* GIF Picker for comments */}
            {showCommentGifPicker && (
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <GiphyPicker
                  compact
                  onSelect={(gifUrl) => {
                    setCommentMediaUrl(gifUrl);
                    setCommentMediaType('gif');
                    setShowCommentGifPicker(false);
                  }}
                  onClose={() => setShowCommentGifPicker(false)}
                />
              </div>
            )}

            {/* Media preview before submitting */}
            {commentMediaUrl && (
              <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                <img
                  src={commentMediaUrl}
                  alt={commentMediaType === 'gif' ? 'GIF' : 'Image'}
                  style={{
                    maxWidth: 180,
                    maxHeight: 140,
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    display: 'block',
                  }}
                />
                <button
                  onClick={() => {
                    setCommentMediaUrl(null);
                    setCommentMediaType(null);
                  }}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Hidden file input for image upload */}
            <input
              type="file"
              accept="image/*"
              ref={commentFileInputRef}
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !currentUserId) return;
                setUploadingCommentImage(true);
                try {
                  // Client-side compression for large images
                  let uploadFile = file;
                  if (file.size > 500 * 1024 && file.type !== 'image/gif') {
                    try {
                      const bitmap = await createImageBitmap(file);
                      const canvas = document.createElement('canvas');
                      const maxDim = 1200;
                      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
                      canvas.width = bitmap.width * scale;
                      canvas.height = bitmap.height * scale;
                      const ctx = canvas.getContext('2d');
                      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
                      uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                        type: 'image/jpeg',
                      });
                    } catch {
                      uploadFile = file;
                    }
                  }
                  const formData = new FormData();
                  formData.append('image', uploadFile);
                  const token = getAccessToken();
                  const resp = await fetch('/api/social/upload-comment-image', {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: formData,
                  });
                  const result = await resp.json();
                  if (!resp.ok || !result.success) {
                    toast.error(result.error || 'Image upload failed');
                    console.warn('[Comment] Upload error:', result.error);
                    setUploadingCommentImage(false);
                    return;
                  }
                  setCommentMediaUrl(result.url);
                  setCommentMediaType('image');
                } catch (err) {
                  console.warn('[Comment] Upload exception:', err);
                  toast.error('Could not upload image');
                }
                setUploadingCommentImage(false);
                e.target.value = ''; // reset file input
              }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
              <Avatar src={currentUserAvatar} name={currentUserName} size={28} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
                <textarea
                  value={newComment}
                  onChange={(e) => {
                    setNewComment(e.target.value);
                    // Auto-grow textarea
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    // Broadcast typing indicator
                    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
                    try {
                      const ch = supabase.channel('social-feed');
                      ch.send({
                        type: 'broadcast',
                        event: 'typing',
                        payload: {
                          post_id: post.id,
                          user_id: currentUserId,
                          name: currentUserName,
                          avatar_url: currentUserAvatar,
                          isTyping: true,
                        },
                      }).catch((e) =>
                        console.warn('[App] Handled promise rejection:', e?.message || e)
                      );
                    } catch (e) {
                      console.warn('[App] Handled exception:', e);
                    }
                    typingDebounceRef.current = setTimeout(() => {
                      try {
                        supabase
                          .channel('social-feed')
                          .send({
                            type: 'broadcast',
                            event: 'typing',
                            payload: {
                              post_id: post.id,
                              user_id: currentUserId,
                              name: currentUserName,
                              avatar_url: currentUserAvatar,
                              isTyping: false,
                            },
                          })
                          .catch((e) =>
                            console.warn('[App] Handled promise rejection:', e?.message || e)
                          );
                      } catch (e) {
                        console.warn('[App] Handled exception:', e);
                      }
                    }, 3000);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitComment();
                    }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmitComment();
                    }
                  }}
                  placeholder={replyingTo ? `Reply to ${replyingTo.name}...` : 'Write a comment...'}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    borderRadius: 18,
                    border: 'none',
                    background: C.bg,
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: 'inherit',
                    resize: 'none',
                    overflow: 'hidden',
                    minHeight: 36,
                    maxHeight: 120,
                    lineHeight: 1.4,
                    boxSizing: 'border-box',
                  }}
                  autoFocus={!!replyingTo}
                  ref={commentInputRef}
                  maxLength={2000}
                  rows={1}
                  aria-label="Write a comment"
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of items) {
                      if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (file && currentUserId) {
                          setUploadingCommentImage(true);
                          (async () => {
                            try {
                              let uploadFile = file;
                              if (file.size > 500 * 1024 && file.type !== 'image/gif') {
                                try {
                                  const bitmap = await createImageBitmap(file);
                                  const canvas = document.createElement('canvas');
                                  const maxDim = 1200;
                                  const scale = Math.min(
                                    1,
                                    maxDim / Math.max(bitmap.width, bitmap.height)
                                  );
                                  canvas.width = bitmap.width * scale;
                                  canvas.height = bitmap.height * scale;
                                  const ctx = canvas.getContext('2d');
                                  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                                  const blob = await new Promise((r) =>
                                    canvas.toBlob(r, 'image/jpeg', 0.82)
                                  );
                                  uploadFile = new File([blob], 'pasted.jpg', {
                                    type: 'image/jpeg',
                                  });
                                } catch {
                                  uploadFile = file;
                                }
                              }
                              const formData = new FormData();
                              formData.append('image', uploadFile);
                              const token = getAccessToken();
                              const resp = await fetch('/api/social/upload-comment-image', {
                                method: 'POST',
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                                body: formData,
                              });
                              const result = await resp.json();
                              if (resp.ok && result.success) {
                                setCommentMediaUrl(result.url);
                                setCommentMediaType('image');
                              }
                            } catch (err) {
                              console.warn('[Comment] Paste upload error:', err);
                            }
                            setUploadingCommentImage(false);
                          })();
                        }
                        return;
                      }
                    }
                  }}
                />
                {/* GIF + Image toolbar row */}
                <div style={{ display: 'flex', gap: 6, paddingLeft: 14, paddingTop: 4 }}>
                  <button
                    onClick={() => setShowCommentGifPicker(!showCommentGifPicker)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: showCommentGifPicker ? C.blue : C.textSec,
                      fontWeight: 700,
                      fontSize: 12,
                      padding: '2px 6px',
                      borderRadius: 4,
                      letterSpacing: 0.5,
                    }}
                    title="Add a GIF"
                  >
                    GIF
                  </button>
                  <button
                    onClick={() => commentFileInputRef.current?.click()}
                    disabled={uploadingCommentImage}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: uploadingCommentImage ? 'wait' : 'pointer',
                      color: C.textSec,
                      fontSize: 16,
                      padding: '0 4px',
                      opacity: uploadingCommentImage ? 0.5 : 1,
                    }}
                    title="Attach an image"
                  >
                    {uploadingCommentImage ? '...' : '📷'}
                  </button>
                </div>
              </div>
              {newComment.length > 1800 && (
                <span
                  style={{
                    fontSize: 11,
                    color: newComment.length >= 2000 ? '#FA383E' : C.textSec,
                    alignSelf: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {2000 - newComment.length}
                </span>
              )}
              <button
                onClick={handleSubmitComment}
                disabled={(!newComment.trim() && !commentMediaUrl) || submittingComment}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color:
                    (newComment.trim() || commentMediaUrl) && !submittingComment
                      ? C.blue
                      : C.textSec,
                  fontWeight: 600,
                  fontSize: 13,
                  opacity: submittingComment ? 0.5 : 1,
                  alignSelf: 'flex-end',
                  paddingBottom: 4,
                }}
              >
                {submittingComment ? '...' : 'Post'}
              </button>
            </div>
          </div>
        )}

        {/* Image Lightbox Modal */}
        {lightboxUrl && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setLightboxUrl(null);
                setLightboxImages([]);
              }
            }}
            onTouchStart={(e) => {
              lightboxTouchRef.current = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
              };
            }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - lightboxTouchRef.current.startX;
              const dy = e.changedTouches[0].clientY - lightboxTouchRef.current.startY;
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && lightboxImages.length > 1) {
                if (dx < 0) {
                  const next = (lightboxIndex + 1) % lightboxImages.length;
                  setLightboxIndex(next);
                  setLightboxUrl(lightboxImages[next]);
                } else {
                  const prev = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
                  setLightboxIndex(prev);
                  setLightboxUrl(lightboxImages[prev]);
                }
              }
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.9)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'zoom-out',
            }}
          >
            <button
              onClick={() => {
                setLightboxUrl(null);
                setLightboxImages([]);
              }}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: 32,
                cursor: 'pointer',
                zIndex: 10000,
              }}
            >
              ×
            </button>
            {lightboxImages.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const prev =
                      (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
                    setLightboxIndex(prev);
                    setLightboxUrl(lightboxImages[prev]);
                  }}
                  style={{
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: 'white',
                    fontSize: 28,
                    cursor: 'pointer',
                    zIndex: 10000,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  ‹
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = (lightboxIndex + 1) % lightboxImages.length;
                    setLightboxIndex(next);
                    setLightboxUrl(lightboxImages[next]);
                  }}
                  style={{
                    position: 'absolute',
                    right: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: 'white',
                    fontSize: 28,
                    cursor: 'pointer',
                    zIndex: 10000,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  ›
                </button>
              </>
            )}
            <img
              src={lightboxUrl}
              alt=""
              style={{
                maxWidth: '95vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: 4,
                userSelect: 'none',
              }}
            />
            {lightboxImages.length > 1 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 24,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: 6,
                }}
              >
                {lightboxImages.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: i === lightboxIndex ? 'white' : 'rgba(255,255,255,0.4)',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparator: only re-render if meaningful post data changed
    // Avoids re-rendering all posts when parent state (e.g. user typing) changes
    return (
      prevProps.post.id === nextProps.post.id &&
      prevProps.post.likeCount === nextProps.post.likeCount &&
      prevProps.post.commentCount === nextProps.post.commentCount &&
      prevProps.post.isLiked === nextProps.post.isLiked &&
      prevProps.post.isBookmarked === nextProps.post.isBookmarked &&
      prevProps.post.content === nextProps.post.content &&
      prevProps.currentUserId === nextProps.currentUserId
    );
  }
);

function ChatWindow({ chat, messages, currentUserId, onSend, onClose }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    await onSend(text);
    setText('');
  };

  // Group messages by date for timestamp labels
  const getDateLabel = (msg, prevMsg) => {
    if (!msg.createdAt) return null;
    const d = new Date(msg.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = d.toDateString();
    if (prevMsg) {
      const prevD = new Date(prevMsg.createdAt);
      if (prevD.toDateString() === dateStr) return null; // Same day, no label
    }
    if (dateStr === today.toDateString()) return 'Today';
    if (dateStr === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      style={{
        width: 328,
        height: 400,
        background: C.card,
        borderRadius: '8px 8px 0 0',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          padding: 8,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Avatar src={chat.avatar} name={chat.name} size={32} online={chat.online} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{chat.name}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {messages.map((m, i) => {
          const label = getDateLabel(m, i > 0 ? messages[i - 1] : null);
          return (
            <React.Fragment key={i}>
              {label && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: C.textSec,
                    padding: '8px 0 4px',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: m.senderId === currentUserId ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '6px 10px',
                    borderRadius: 16,
                    background: m.senderId === currentUserId ? C.blue : C.bg,
                    color: m.senderId === currentUserId ? 'white' : C.text,
                    fontSize: 14,
                  }}
                >
                  {m.text}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 8, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Aa"
          style={{
            flex: 1,
            padding: '6px 12px',
            borderRadius: 18,
            border: 'none',
            background: C.bg,
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.blue,
            fontSize: 16,
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ===== CLUB PAGE CREATE MODAL =====
function ClubPageCreateModal({ C, commanderData, userId, onCreated, onClose }) {
  const [pageName, setPageName] = useState(commanderData?.venue_name || '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('poker_room');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const categories = [
    { key: 'poker_room', label: 'Poker Room' },
    { key: 'casino', label: 'Casino' },
    { key: 'card_club', label: 'Card Club' },
    { key: 'charity', label: 'Charity Organization' },
    { key: 'league', label: 'League / Tour' },
    { key: 'other', label: 'Other' },
  ];

  const handleCreate = async () => {
    if (!pageName.trim()) {
      setError('Page name is required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: pageName.trim(),
          page_type: 'club',
          description: description.trim(),
          category,
          owner_id: userId,
          linked_venue_id: commanderData?.venue_id ? String(commanderData.venue_id) : undefined,
          location_city: (() => {
            try {
              const v = JSON.parse(localStorage.getItem('commander_venue') || '{}');
              return v.city || v.location_city || '';
            } catch {
              return '';
            }
          })(),
          location_state: (() => {
            try {
              const v = JSON.parse(localStorage.getItem('commander_venue') || '{}');
              return v.state || v.location_state || '';
            } catch {
              return '';
            }
          })(),
          is_public: true,
          allow_member_posts: false,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success && json.data) {
        onCreated(json.data);
      } else {
        setError(json.error || 'Failed to create page');
      }
    } catch (e) {
      setError('Network error. Please try again.');
    }
    setCreating(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
      />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 12,
          width: '90%',
          maxWidth: 480,
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: C.text }}>
          Create Your Club Page
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: C.textSec }}>
          Set Up A Public Page For Your Venue On Smarter.Poker Social
        </p>

        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            marginBottom: 4,
          }}
        >
          Page Name
        </label>
        <input
          value={pageName}
          onChange={(e) => setPageName(e.target.value)}
          placeholder="Your Venue Name"
          style={{
            width: '100%',
            padding: '10px 14px',
            border: '1px solid #CCD0D5',
            borderRadius: 8,
            fontSize: 15,
            outline: 'none',
            marginBottom: 14,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            color: '#050505',
            background: '#fff',
          }}
        />

        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            marginBottom: 4,
          }}
        >
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            border: '1px solid #CCD0D5',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
            marginBottom: 14,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            background: '#fff',
            color: '#050505',
          }}
        >
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            marginBottom: 4,
          }}
        >
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell People About Your Venue..."
          rows={3}
          style={{
            width: '100%',
            padding: '10px 14px',
            border: '1px solid #CCD0D5',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
            resize: 'vertical',
            marginBottom: 14,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            color: '#050505',
            background: '#fff',
          }}
        />

        {error && <p style={{ color: C.red, fontSize: 13, margin: '0 0 10px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: 20,
              border: 'none',
              background: '#E4E6EB',
              color: C.text,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !pageName.trim()}
            style={{
              padding: '10px 24px',
              borderRadius: 20,
              border: 'none',
              background: C.blue,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              opacity: creating || !pageName.trim() ? 0.5 : 1,
            }}
          >
            {creating ? 'Creating...' : 'Create Page'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== CLUB PAGE DASHBOARD (Owner Management View) =====
const AMENITIES_LIST = [
  {
    cat: 'Dining & Beverages',
    items: [
      { k: 'food_service', l: 'Food Service' },
      { k: 'food_tableside', l: 'Food Tableside' },
      { k: 'order_food_at_table', l: 'Order Food at Table' },
      { k: 'full_bar', l: 'Full Bar' },
      { k: 'cocktail_service', l: 'Cocktail Service' },
      { k: 'self_serve_drinks', l: 'Self Serve Drink Station' },
      { k: 'snack_bar', l: 'Snack Bar' },
      { k: 'room_service', l: 'Room Service' },
    ],
  },
  {
    cat: 'Parking & Lodging',
    items: [
      { k: 'free_parking', l: 'Free Parking' },
      { k: 'self_parking', l: 'Self Parking' },
      { k: 'valet_parking', l: 'Valet Parking' },
      { k: 'parking_garage', l: 'Parking Garage' },
      { k: 'hotel_onsite', l: 'Hotel On-Site' },
      { k: 'discounted_hotel', l: 'Discounted Hotel Rates' },
    ],
  },
  {
    cat: 'Player Services',
    items: [
      { k: 'phone_in_list', l: 'Phone-in Waitlist' },
      { k: 'check_cashing', l: 'Check Cashing' },
      { k: 'currency_exchange', l: 'Currency Exchange' },
      { k: 'safe_deposit', l: 'Safe Deposit Boxes' },
      { k: 'atm_onsite', l: 'ATM On-Site' },
      { k: 'coat_check', l: 'Coat Check' },
    ],
  },
  {
    cat: 'Player Perks',
    items: [
      { k: 'comps_program', l: 'Comps Program' },
      { k: 'loyalty_program', l: 'Loyalty Program' },
      { k: 'rewards_card', l: 'Player Rewards Card' },
      { k: 'hourly_drawings', l: 'Hourly Drawings' },
      { k: 'jackpot_promos', l: 'Jackpot Promotions' },
    ],
  },
  {
    cat: 'Comfort & Environment',
    items: [
      { k: 'non_smoking', l: 'Non-Smoking' },
      { k: 'smoking_area', l: 'Smoking Area' },
      { k: 'massage', l: 'Massage Service' },
      { k: 'nearby_restrooms', l: 'Nearby Restrooms' },
      { k: 'wifi', l: 'Free WiFi' },
      { k: 'usb_chargers', l: 'USB Chargers' },
      { k: 'charging_stations', l: 'Charging Stations' },
      { k: 'televisions', l: 'Televisions' },
      { k: 'tvs_at_tables', l: 'TVs at Tables' },
    ],
  },
  {
    cat: 'Table Features',
    items: [
      { k: 'auto_shufflers', l: 'Auto Shufflers' },
      { k: 'rfid_tables', l: 'RFID Tables' },
      { k: 'live_streaming', l: 'Live Streaming' },
    ],
  },
  {
    cat: 'Facility',
    items: [
      { k: 'private_room', l: 'Private Card Room' },
      { k: 'high_limit', l: 'High-Limit Room' },
      { k: 'tournament_room', l: 'Tournament Room' },
      { k: 'membership_required', l: 'Membership Required' },
    ],
  },
];
const CATEGORY_LABELS = {
  poker_room: 'Poker Room',
  casino: 'Casino',
  card_club: 'Card Club',
  charity: 'Charity Organization',
  league: 'League / Tour',
  home_game: 'Home Game',
  other: 'Other',
};
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function ClubPageDashboard({ C, page, userId, userName, onBack, onPageUpdated, onGoLive }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = usePersistedState('sp-filters-social-media', 'posts');
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postContent, setPostContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingPage, setEditingPage] = useState(false);
  const [editName, setEditName] = useState(page.name || '');
  const [editDesc, setEditDesc] = useState(page.description || '');
  const [editWebsite, setEditWebsite] = useState(page.website || '');
  const [editPhone, setEditPhone] = useState(page.phone || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(page.avatar_url || '');
  const [editCity, setEditCity] = useState(page.location_city || '');
  const [editState, setEditState] = useState(page.location_state || '');
  const [editAddress, setEditAddress] = useState((page.metadata || {}).address || '');
  const [saving, setSaving] = useState(false);

  // Enhanced state — Photos, Schedule, Tournaments, Amenities
  const meta = page.metadata || {};
  const [photos, setPhotos] = useState(meta.photos || []);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [schedule, setSchedule] = useState(() => {
    const s = meta.run_schedule || {};
    const init = {};
    DAYS.forEach((d) => {
      init[d] = { open: false, hours: '', games: [], location: '', ...(s[d] || {}) };
    });
    return init;
  });
  const [newGame, setNewGame] = useState({});
  const [tournaments, setTournaments] = useState([]);
  const [amenities, setAmenities] = useState(meta.amenities || {});
  const [socialLinks, setSocialLinks] = useState(
    meta.social_links || { facebook: '', instagram: '', twitter: '' }
  );
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaved, setMetaSaved] = useState('');

  // "Edit Poker Near Me Details" — only for home_game pages
  // These fields write directly to commander_home_groups via the commander API
  // (same endpoint as manage.js Settings tab).
  const [pnmPhone, setPnmPhone] = useState('');
  const [pnmWebsite, setPnmWebsite] = useState('');
  const [pnmSaving, setPnmSaving] = useState(false);
  const [pnmSaved, setPnmSaved] = useState('');
  const [showPnmEdit, setShowPnmEdit] = useState(false);

  // Fetch current contact_phone / website_url on mount if this is a home game page
  useEffect(() => {
    if (page.page_type !== 'home_game' || !page.linked_entity_id) return;
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await fetch(`/api/commander/home-games/groups/${page.linked_entity_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        const g = json.group || json.data?.group || {};
        if (!cancelled) {
          setPnmPhone(g.contact_phone || '');
          setPnmWebsite(g.website_url || '');
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [page.linked_entity_id, page.page_type]);

  const handleSavePnmDetails = async () => {
    if (!page.linked_entity_id) return;
    setPnmSaving(true);
    setPnmSaved('');
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${page.linked_entity_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          contact_phone: pnmPhone.trim() || null,
          website_url: pnmWebsite.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && !json.error) {
        setPnmSaved('Saved!');
        setTimeout(() => setPnmSaved(''), 3000);
      } else {
        setPnmSaved('Error saving');
      }
    } catch {
      setPnmSaved('Error saving');
    }
    setPnmSaving(false);
  };

  // Fetch tournaments on mount (always, so floating Live Event button works on all tabs)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/venue/${page.id}`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (!cancelled && data.success) {
          setTournaments(data.data.upcoming_tournaments || []);
        }
      } catch (err) {
        console.warn('Failed to load tournaments:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page.id]);

  // Live Games state
  const [liveGames, setLiveGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  // Timer tick for live countdown clocks
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTimerTick((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const [pendingFollowers, setPendingFollowers] = useState([]);

  // Cover photo state
  const [coverPhoto, setCoverPhoto] = useState(
    (page.metadata || {}).cover_photo_url || page.cover_url || ''
  );
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef(null);

  // Logo upload state
  const [logoUrl, setLogoUrl] = useState((page.metadata || {}).logo_url || page.avatar_url || '');
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef(null);

  // Post media upload state
  const [postMedia, setPostMedia] = useState([]);
  const [postUploading, setPostUploading] = useState(false);
  const postMediaRef = useRef(null);

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'covers');
      formData.append('prefix', page.id);
      const _coverToken = getAccessToken();
      const uploadRes = await fetch('/api/social/upload', {
        method: 'POST',
        headers: _coverToken ? { Authorization: `Bearer ${_coverToken}` } : {},
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(`Request failed (${uploadRes.status})`);
      const uploadJson = await uploadRes.json();
      if (uploadJson.success && uploadJson.url) {
        const url = uploadJson.url;
        setCoverPhoto(url);
        // Save to both metadata.cover_photo_url AND cover_url column so public page stays in sync
        const merged = { ...page.metadata, cover_photo_url: url };
        setMetaSaving(true);
        setMetaSaved('');
        try {
          const token = getAccessToken();
          const res = await fetch('/api/social/pages', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              id: page.id,
              owner_id: userId,
              cover_url: url,
              metadata: merged,
            }),
          });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success && json.data) {
            onPageUpdated(json.data);
            setMetaSaved('Cover photo updated!');
            setTimeout(() => setMetaSaved(''), 2000);
          }
        } catch (saveErr) {
          console.warn('Cover save error:', saveErr);
        }
        setMetaSaving(false);
      } else {
        toast.error('Cover upload failed: ' + (uploadJson.error || 'Unknown error'));
      }
    } catch (err) {
      console.warn('Cover upload error:', err);
      toast.error('Cover upload error: ' + err.message);
    }
    setCoverUploading(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'logos');
      formData.append('prefix', page.id);
      const _logoToken = getAccessToken();
      const uploadRes = await fetch('/api/social/upload', {
        method: 'POST',
        headers: _logoToken ? { Authorization: `Bearer ${_logoToken}` } : {},
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(`Request failed (${uploadRes.status})`);
      const uploadJson = await uploadRes.json();
      if (uploadJson.success && uploadJson.url) {
        const url = uploadJson.url;
        setLogoUrl(url);
        // Save to both metadata.logo_url AND avatar_url column so public page stays in sync
        const merged = { ...page.metadata, logo_url: url };
        setMetaSaving(true);
        setMetaSaved('');
        try {
          const token = getAccessToken();
          const res = await fetch('/api/social/pages', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              id: page.id,
              owner_id: userId,
              avatar_url: url,
              metadata: merged,
            }),
          });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success && json.data) {
            onPageUpdated(json.data);
            setMetaSaved('Logo updated!');
            setTimeout(() => setMetaSaved(''), 2000);
          }
        } catch (saveErr) {
          console.warn('Logo save error:', saveErr);
        }
        setMetaSaving(false);
      } else {
        toast.error('Logo upload failed: ' + (uploadJson.error || 'Unknown error'));
      }
    } catch (err) {
      console.warn('Logo upload error:', err);
      toast.error('Logo upload error: ' + err.message);
    }
    setLogoUploading(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handlePostMediaSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = 10 - postMedia.length;
    if (remaining <= 0) return;
    const toUpload = files.slice(0, remaining);
    setPostUploading(true);
    const uploaded = [];
    for (const file of toUpload) {
      const isVideo = file.type.startsWith('video/');
      try {
        if (isVideo) {
          // Direct-to-Supabase upload for videos (bypasses Vercel body limit)
          const _clubVidToken = getAccessToken();
          const metaRes = await fetch('/api/social/upload-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(_clubVidToken ? { Authorization: `Bearer ${_clubVidToken}` } : {}),
            },
            body: JSON.stringify({
              fileName: file.name,
              fileSize: file.size,
              // Strip codec suffixes (iOS/Android) — bucket uses exact MIME matching
              mimeType: sniffMimeType(file),
              folder: 'club-posts',
              prefix: page.id,
            }),
          });
          if (!metaRes.ok) throw new Error(`Request failed (${metaRes.status})`);
          const meta = await metaRes.json();
          if (!meta.success) {
            toast.error('Upload failed: ' + (meta.error || 'Unknown error'));
            continue;
          }
          const uploadRes = await fetch(meta.signedUrl, {
            method: 'PUT',
            // Clean MIME — raw file.type may include codec suffix causing Supabase bucket rejection
            headers: { 'Content-Type': sniffMimeType(file) },
            body: file,
          });
          if (!uploadRes.ok) {
            toast.error('Video upload failed, please try again');
            continue;
          }
          uploaded.push({ type: 'video', url: meta.publicUrl });
        } else {
          // Keep existing API for images (small files)
          const formData = new FormData();
          formData.append('file', file);
          formData.append('folder', 'club-posts');
          formData.append('prefix', page.id);
          const _clubImgToken = getAccessToken();
          const res = await fetch('/api/social/upload', {
            method: 'POST',
            headers: _clubImgToken ? { Authorization: `Bearer ${_clubImgToken}` } : {},
            body: formData,
          });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success && json.url) {
            uploaded.push({ type: json.type || 'photo', url: json.url });
          } else {
            console.warn('[ClubPage] Upload failed:', json.error);
            toast.error('Upload failed: ' + (json.error || 'Unknown error'));
          }
        }
      } catch (err) {
        console.warn('[ClubPage] Upload error:', err);
        toast.error('Upload failed: ' + err.message);
      }
    }
    setPostMedia((prev) => [...prev, ...uploaded]);
    setPostUploading(false);
    if (postMediaRef.current) postMediaRef.current.value = '';
  };

  // Fetch live games
  useEffect(() => {
    if (activeTab === 'live_games') {
      const fetchGames = async () => {
        setLoadingGames(true);
        try {
          const res = await fetch(`/api/social/pages/games?page_id=${page.id}`);
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success) {
            setLiveGames(json.data || []);
            setTimerTick(0);
          }
        } catch (e) {
          console.warn('Games fetch error:', e);
        }
        setLoadingGames(false);
      };
      const fetchPending = async () => {
        try {
          const res = await fetch(
            `/api/social/pages/follow?page_id=${page.id}&requester_id=${userId}`
          );
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success)
            setPendingFollowers((json.data || []).filter((f) => f.status === 'pending'));
        } catch (e) {
          console.warn('Pending fetch error:', e);
        }
      };
      fetchGames();
      fetchPending();
      const interval = setInterval(() => {
        fetchGames();
        fetchPending();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [activeTab, page.id]);

  const handleApproveFollower = (followerId, action) => {
    // EAGER STATE SYNCHRONIZATION: Remove from pending list immediately (BFCache-safe)
    const prevPending = pendingFollowers;
    setPendingFollowers((prev) => prev.filter((f) => f.user_id !== followerId));

    // Fire-and-forget API call with rollback on failure
    const token = getAccessToken();
    fetch('/api/social/pages/follow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ page_id: page.id, user_id: userId, action, follower_id: followerId }),
    }).catch((e) => {
      console.warn('Approve/reject error:', e);
      // Rollback on failure
      setPendingFollowers(prevPending);
    });
  };

  // Save metadata helper
  const saveMetadata = async (newMeta, label) => {
    setMetaSaving(true);
    setMetaSaved('');
    try {
      const token = getAccessToken();
      const merged = { ...page.metadata, ...newMeta };
      const res = await fetch('/api/social/pages', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: page.id, owner_id: userId, metadata: merged }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success && json.data) {
        onPageUpdated(json.data);
        setMetaSaved(label || 'Saved!');
        setTimeout(() => setMetaSaved(''), 2000);

        // Auto-geocode locations in background (fire-and-forget)
        try {
          const locations = [];
          if (json.data.location_city) {
            locations.push(
              json.data.location_city +
                (json.data.location_state ? ', ' + json.data.location_state : '')
            );
          }
          const sched = merged.run_schedule || newMeta.run_schedule;
          if (sched) {
            Object.values(sched || {}).forEach((day) => {
              if (day && day.open && day.location && day.location.trim()) {
                locations.push(day.location.trim());
              }
            });
          }
          const existing = merged.geocoded_locations || {};
          const unique = [...new Set(locations)].filter((loc) => !existing[loc]);
          if (unique.length > 0) {
            const token = getAccessToken();
            fetch('/api/social/geocode-locations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ page_id: page.id, locations: unique }),
            }).catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
          }
        } catch (geoErr) {
          console.warn('[ClubPage] Background geocoding failed:', geoErr);
        }
      }
    } catch (e) {
      console.warn('Meta save error:', e);
      setMetaSaved('Error saving');
    }
    setMetaSaving(false);
  };

  // Fetch posts
  useEffect(() => {
    const fetchPosts = async () => {
      setLoadingPosts(true);
      try {
        const res = await fetch(`/api/social/pages/posts?page_id=${page.id}&user_id=${userId}`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = await res.json();
        if (json.success) setPosts(json.data || []);
      } catch (e) {
        console.warn('Club page posts fetch error:', e);
      }
      setLoadingPosts(false);
    };
    fetchPosts();
  }, [page.id, userId]);

  const handlePost = async () => {
    if (!postContent.trim() && postMedia.length === 0) return;
    setPosting(true);
    try {
      const token = getAccessToken();
      const mediaUrls = postMedia.map((m) => m.url);
      const contentType = postMedia.some((m) => m.type === 'video')
        ? 'video'
        : postMedia.length > 0
          ? 'image'
          : 'text';
      const res = await fetch('/api/social/pages/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          page_id: page.id,
          author_id: userId,
          content: postContent.trim(),
          content_type: contentType,
          media_urls: mediaUrls,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success && json.data) {
        setPosts((prev) => [
          {
            ...json.data,
            author: { username: userName || userId?.slice(0, 6) || 'You' },
            user_liked: false,
          },
          ...prev,
        ]);
        setPostContent('');
        setPostMedia([]);
        // Notify global social feed so other tabs pick up the mirrored post
        busEmit.dataMutated('social');
        broadcastSync('smarter_poker_social_sync', {
          action: 'refresh_feed',
          tabId: BROADCAST_TAB_ID,
        });
      } else if (json.error) {
        toast.error('Post failed: ' + json.error);
      }
    } catch (e) {
      console.warn('Post error:', e);
      toast.error('Post failed: ' + e.message);
    }
    setPosting(false);
  };

  const handleDeletePost = async (postId) => {
    // EAGER STATE SYNCHRONIZATION: Remove post immediately (BFCache-safe)
    const prevPosts = posts;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/social/pages/posts?id=${postId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        // Server refused — revert optimistic removal so post stays visible
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Delete failed (${res.status})`);
      }
    } catch (e) {
      console.warn('Delete error:', e);
      setPosts(prevPosts); // Rollback on failure
      toast.error('Could not delete post, please try again');
    }
  };

  const handleSavePage = async () => {
    setSaving(true);
    try {
      const token = getAccessToken();
      // Merge address into metadata
      const updatedMetadata = { ...page.metadata, address: editAddress.trim() };
      const res = await fetch('/api/social/pages', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: page.id,
          owner_id: userId,
          name: editName.trim(),
          description: editDesc.trim(),
          website: editWebsite.trim(),
          phone: editPhone.trim(),
          avatar_url: editAvatarUrl.trim() || null,
          location_city: editCity.trim(),
          location_state: editState.trim(),
          metadata: updatedMetadata,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success && json.data) {
        onPageUpdated(json.data);
        setEditingPage(false);
      }
    } catch (e) {
      console.warn('Save error:', e);
    }
    setSaving(false);
  };

  const handleTogglePin = async (post) => {
    try {
      const token = getAccessToken();
      await fetch('/api/social/pages/posts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: post.id, author_id: userId, is_pinned: !post.is_pinned }),
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, is_pinned: !p.is_pinned } : p))
      );
    } catch (e) {
      console.warn('Pin error:', e);
    }
  };

  const inputSt = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #CCD0D5',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
  const labelSt = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: C.textSec,
    marginBottom: 4,
  };
  const btnPrimary = {
    padding: '8px 20px',
    borderRadius: 20,
    border: 'none',
    background: C.blue,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  const btnSec = {
    padding: '8px 16px',
    borderRadius: 20,
    border: 'none',
    background: '#E4E6EB',
    color: C.text,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  const cardSt = { background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 };
  const savedBadge = metaSaved ? (
    <span
      style={{
        fontSize: 12,
        color: metaSaved === 'Error saving' ? '#F02849' : '#42B72A',
        fontWeight: 600,
        marginLeft: 8,
      }}
    >
      {metaSaved}
    </span>
  ) : null;

  const tabs = [
    { key: 'posts', label: 'Posts' },
    { key: 'photos', label: 'Photos' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'tournaments', label: 'Tourneys' },
    { key: 'amenities', label: 'Amenities' },
    { key: 'live_games', label: 'Live Games' },
    { key: 'about', label: 'About' },
  ];

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Header */}
      <div style={{ background: C.card, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
        {/* Cover Photo Area */}
        <div
          style={{
            height: 200,
            position: 'relative',
            background: coverPhoto
              ? `url(${coverPhoto}) center/cover no-repeat`
              : 'linear-gradient(135deg, #1877F2 0%, #166FE5 50%, #1877F2 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 16,
          }}
        >
          {/* Edit Cover Photo button */}
          <input
            type="file"
            accept="image/*"
            ref={coverInputRef}
            onChange={handleCoverUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              backdropFilter: 'blur(4px)',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {coverUploading ? 'Uploading...' : 'Upload Photo'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="file"
              accept="image/*"
              ref={logoInputRef}
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => logoInputRef.current?.click()}
              title="Click To Upload Logo"
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 30,
                fontWeight: 800,
                color: '#1877F2',
                border: '3px solid #fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={page.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                />
              ) : (
                (page.name || 'C')[0].toUpperCase()
              )}
              <div
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#1877F2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              {logoUploading && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(255,255,255,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#1877F2',
                    borderRadius: '50%',
                  }}
                >
                  ...
                </div>
              )}
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#fff',
                  textShadow: '0 1px 6px rgba(0,0,0,0.4)',
                }}
              >
                {page.name}
              </h2>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                {page.follower_count || 0} follower{(page.follower_count || 0) !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => (onBack ? onBack() : router.push('/hub/social-media'))}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#E4E6EB',
              color: C.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Back
          </button>
          <button
            onClick={() => setEditingPage(!editingPage)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: editingPage ? C.blue : '#E4E6EB',
              color: editingPage ? '#fff' : C.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Edit Page
          </button>
          {onGoLive && (
            <button
              onClick={onGoLive}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#E4E6EB',
                color: '#E53935',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#E53935',
                  display: 'inline-block',
                }}
              ></span>
              Go Live
            </button>
          )}
          <button
            onClick={() => router.push(`/club/${page.id}`)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#E4E6EB',
              color: C.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginLeft: 'auto',
            }}
          >
            View Public Page
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderTop: `1px solid ${C.border}` }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1,
                padding: '12px 0',
                border: 'none',
                background: 'transparent',
                color: activeTab === t.key ? C.blue : C.textSec,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                borderBottom: activeTab === t.key ? `3px solid ${C.blue}` : '3px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Edit Page Panel */}
      {editingPage && (
        <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: C.text }}>
            Edit Page Info
          </h3>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: C.textSec,
              marginBottom: 4,
            }}
          >
            Name
          </label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #CCD0D5',
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 10,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: C.textSec,
              marginBottom: 4,
            }}
          >
            Description
          </label>
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #CCD0D5',
              borderRadius: 8,
              fontSize: 14,
              resize: 'vertical',
              marginBottom: 10,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSec,
                  marginBottom: 4,
                }}
              >
                Website
              </label>
              <input
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CCD0D5',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSec,
                  marginBottom: 4,
                }}
              >
                Phone
              </label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="(555) 555-5555"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CCD0D5',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: C.textSec,
              marginBottom: 4,
              marginTop: 10,
            }}
          >
            Profile Image URL
          </label>
          <input
            value={editAvatarUrl}
            onChange={(e) => setEditAvatarUrl(e.target.value)}
            placeholder="https://your-image-url.com/logo.png"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #CCD0D5',
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 10,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: C.textSec,
              marginBottom: 4,
            }}
          >
            Street Address
          </label>
          <input
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="123 Main St"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #CCD0D5',
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 10,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSec,
                  marginBottom: 4,
                }}
              >
                City
              </label>
              <input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                placeholder="Las Vegas"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CCD0D5',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSec,
                  marginBottom: 4,
                }}
              >
                State
              </label>
              <input
                value={editState}
                onChange={(e) => setEditState(e.target.value)}
                placeholder="NV"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CCD0D5',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setEditingPage(false)}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: 'none',
                background: '#E4E6EB',
                color: C.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSavePage}
              disabled={saving}
              style={{
                padding: '8px 20px',
                borderRadius: 20,
                border: 'none',
                background: C.blue,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Poker Near Me Details — home_game pages only */}
      {page.page_type === 'home_game' && (
        <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPnmEdit ? 12 : 0 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Edit Poker Near Me Details</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textSec }}>Contact info shown publicly on your Poker Near Me card and details page.</p>
            </div>
            <button
              onClick={() => setShowPnmEdit(!showPnmEdit)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: showPnmEdit ? C.blue : '#E4E6EB', color: showPnmEdit ? '#fff' : C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginLeft: 12 }}
            >
              {showPnmEdit ? 'Hide' : 'Edit'}
            </button>
          </div>
          {showPnmEdit && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Phone Number</label>
                  <input
                    type="tel"
                    value={pnmPhone}
                    onChange={(e) => setPnmPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    maxLength={30}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textSec }}>Shown as a tap-to-call link on mobile.</p>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Website / Social Link</label>
                  <input
                    type="url"
                    value={pnmWebsite}
                    onChange={(e) => setPnmWebsite(e.target.value)}
                    placeholder="https://yoursite.com"
                    maxLength={255}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textSec }}>Facebook group, website, or any URL.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleSavePnmDetails}
                  disabled={pnmSaving}
                  style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: pnmSaving ? 0.5 : 1 }}
                >
                  {pnmSaving ? 'Saving...' : 'Save Poker Near Me Details'}
                </button>
                {pnmSaved && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: pnmSaved === 'Error saving' ? '#F02849' : '#42B72A' }}>{pnmSaved}</span>
                )}
                <a
                  href={`/hub/commander/home-games/${page.linked_entity_id}/manage?tab=settings`}
                  style={{ marginLeft: 'auto', fontSize: 12, color: C.blue, textDecoration: 'none', fontWeight: 600 }}
                >
                  Full Settings →
                </a>
              </div>
            </>
          )}
        </div>
      )}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <>
          {/* Post Composer */}
          <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: C.blue,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {(page.name || 'C')[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                Post as {page.name}
              </span>
            </div>
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder={`What's happening at ${page.name || 'your venue'}?`}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #CCD0D5',
                borderRadius: 8,
                fontSize: 15,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                lineHeight: 1.4,
                color: '#050505',
                background: '#fff',
              }}
            />

            {/* Media preview thumbnails */}
            {postMedia.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {postMedia.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      width: 80,
                      height: 80,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid #CCD0D5',
                    }}
                  >
                    {m.type === 'video' ? (
                      <video
                        src={m.url}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <img
                        src={m.url}
                        loading="lazy"
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                    <button
                      onClick={() => setPostMedia((prev) => prev.filter((_, j) => j !== i))}
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Media toolbar + Post button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid #E4E6EB',
              }}
            >
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  ref={postMediaRef}
                  onChange={handlePostMediaSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => postMediaRef.current?.click()}
                  disabled={postUploading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#F0F2F5',
                    color: '#1877F2',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#45BD62"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  {postUploading ? 'Uploading...' : 'Photo/Video'}
                </button>
              </div>
              <button
                onClick={handlePost}
                disabled={
                  posting || postUploading || (!postContent.trim() && postMedia.length === 0)
                }
                style={{
                  padding: '8px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#1877F2',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  opacity:
                    posting || postUploading || (!postContent.trim() && postMedia.length === 0)
                      ? 0.5
                      : 1,
                }}
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>

          {/* Posts Feed */}
          {loadingPosts ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid #E4E6EB',
                  borderTopColor: '#1877F2',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 12px',
                }}
              />
              <p>Loading Posts...</p>
            </div>
          ) : posts.length === 0 ? (
            <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
                No Posts Yet
              </p>
              <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
                Share Your First Update With Your Followers!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {posts.map((post) => (
                <div
                  key={post.id}
                  style={{
                    background: C.card,
                    borderRadius: 10,
                    border: '1px solid #E4E6EB',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '12px 14px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: C.blue,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          {(page.name || 'C')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            {page.name}
                          </div>
                          <div style={{ fontSize: 11, color: C.textSec }}>
                            {timeAgo(post.created_at)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {post.is_pinned && (
                          <span
                            style={{
                              fontSize: 10,
                              background: '#FFB800',
                              color: '#000',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            PINNED
                          </span>
                        )}
                        <button
                          onClick={() => handleTogglePin(post)}
                          title={post.is_pinned ? 'Unpin' : 'Pin'}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: C.textSec,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {post.is_pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: C.textSec,
                            fontSize: 14,
                          }}
                        >
                          x
                        </button>
                      </div>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 15,
                        color: C.text,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {post.content}
                    </p>
                  </div>
                  <div
                    style={{
                      borderTop: `1px solid ${C.border}`,
                      padding: '6px 14px',
                      display: 'flex',
                      gap: 16,
                      fontSize: 12,
                      color: C.textSec,
                    }}
                  >
                    <span>{post.like_count || 0} likes</span>
                    <span>{post.comment_count || 0} comments</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Photos Tab */}
      {activeTab === 'photos' && (
        <div style={cardSt}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
              Photo Gallery
            </h3>
            {savedBadge}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              value={newPhotoUrl}
              onChange={(e) => setNewPhotoUrl(e.target.value)}
              placeholder="Image URL (https://...)"
              style={{ ...inputSt, flex: 2, minWidth: 200 }}
            />
            <input
              value={newPhotoCaption}
              onChange={(e) => setNewPhotoCaption(e.target.value)}
              placeholder="Caption (optional)"
              style={{ ...inputSt, flex: 1, minWidth: 120 }}
            />
            <button
              onClick={() => {
                if (!newPhotoUrl.trim()) return;
                const updated = [
                  ...photos,
                  {
                    url: newPhotoUrl.trim(),
                    caption: newPhotoCaption.trim(),
                    uploaded_at: new Date().toISOString(),
                  },
                ];
                setPhotos(updated);
                setNewPhotoUrl('');
                setNewPhotoCaption('');
                saveMetadata({ photos: updated }, 'Photo added!');
              }}
              disabled={!newPhotoUrl.trim() || metaSaving}
              style={{
                ...btnPrimary,
                opacity: !newPhotoUrl.trim() || metaSaving ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              + Add Photo
            </button>
          </div>
          {photos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
              <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Photos Yet</div>
              <p style={{ margin: 0, fontSize: 14 }}>
                No Photos Yet. Add Photos To Showcase Your Venue!
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 8,
              }}
            >
              {photos.map((photo, i) => (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    borderRadius: 8,
                    overflow: 'hidden',
                    aspectRatio: '1',
                    background: '#1a1a2e',
                  }}
                >
                  <img
                    src={photo.url}
                    loading="lazy"
                    alt={photo.caption || 'Club photo'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  {photo.caption && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                        padding: '16px 8px 6px',
                        fontSize: 11,
                        color: '#fff',
                      }}
                    >
                      {photo.caption}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const updated = photos.filter((_, j) => j !== i);
                      setPhotos(updated);
                      saveMetadata({ photos: updated }, 'Photo removed');
                    }}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div style={cardSt}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
              Weekly Run Schedule
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {savedBadge}
              <button
                onClick={() => saveMetadata({ run_schedule: schedule }, 'Schedule saved!')}
                disabled={metaSaving}
                style={{ ...btnPrimary, opacity: metaSaving ? 0.5 : 1 }}
              >
                {metaSaving ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DAYS.map((day) => {
              const d = schedule[day];
              return (
                <div
                  key={day}
                  style={{
                    background: d.open ? 'rgba(24,119,242,0.06)' : '#f5f5f5',
                    borderRadius: 10,
                    padding: '10px 14px',
                    border: `1px solid ${d.open ? 'rgba(24,119,242,0.2)' : '#e4e6eb'}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: d.open ? 8 : 0,
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        minWidth: 70,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={d.open}
                        onChange={(e) =>
                          setSchedule((prev) => ({
                            ...prev,
                            [day]: { ...prev[day], open: e.target.checked },
                          }))
                        }
                        style={{ width: 18, height: 18, accentColor: C.blue }}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.text,
                          textTransform: 'capitalize',
                        }}
                      >
                        {day}
                      </span>
                    </label>
                    {d.open && (
                      <input
                        value={d.hours}
                        onChange={(e) =>
                          setSchedule((prev) => ({
                            ...prev,
                            [day]: { ...prev[day], hours: e.target.value },
                          }))
                        }
                        placeholder="e.g. 10am - 4am"
                        style={{ ...inputSt, flex: 1, maxWidth: 180 }}
                      />
                    )}
                    {!d.open && (
                      <span style={{ fontSize: 13, color: C.textSec, fontStyle: 'italic' }}>
                        Closed
                      </span>
                    )}
                  </div>
                  {d.open && (
                    <div style={{ marginLeft: 28 }}>
                      <input
                        value={d.location || ''}
                        onChange={(e) =>
                          setSchedule((prev) => ({
                            ...prev,
                            [day]: { ...prev[day], location: e.target.value },
                          }))
                        }
                        placeholder="Location (e.g. Chicago, IL)"
                        style={{ ...inputSt, marginBottom: 6, maxWidth: 260 }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {(d.games || []).map((g, gi) => (
                          <span
                            key={gi}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: C.blue,
                              color: '#fff',
                              padding: '3px 10px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {g}
                            <button
                              onClick={() =>
                                setSchedule((prev) => ({
                                  ...prev,
                                  [day]: {
                                    ...prev[day],
                                    games: prev[day].games.filter((_, k) => k !== gi),
                                  },
                                }))
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 12,
                                padding: 0,
                                marginLeft: 2,
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={newGame[day] || ''}
                          onChange={(e) =>
                            setNewGame((prev) => ({ ...prev, [day]: e.target.value }))
                          }
                          placeholder="Add Game (e.g. 1/2 NLH)"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (newGame[day] || '').trim()) {
                              setSchedule((prev) => ({
                                ...prev,
                                [day]: {
                                  ...prev[day],
                                  games: [...(prev[day].games || []), newGame[day].trim()],
                                },
                              }));
                              setNewGame((prev) => ({ ...prev, [day]: '' }));
                            }
                          }}
                          style={{ ...inputSt, flex: 1 }}
                        />
                        <button
                          onClick={() => {
                            if (!(newGame[day] || '').trim()) return;
                            setSchedule((prev) => ({
                              ...prev,
                              [day]: {
                                ...prev[day],
                                games: [...(prev[day].games || []), newGame[day].trim()],
                              },
                            }));
                            setNewGame((prev) => ({ ...prev, [day]: '' }));
                          }}
                          style={btnSec}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tournaments Tab — Read-Only (managed via Commander) */}
      {activeTab === 'tournaments' && (
        <div style={cardSt}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
              Tournament Schedule
            </h3>
          </div>
          {/* Commander-only notice */}
          <div
            style={{
              background: 'rgba(24,119,242,0.06)',
              border: '1px solid rgba(24,119,242,0.2)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 18 }}>&#9432;</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Tournament Schedules Are Managed Through Club Commander
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                Tournaments Added In Commander Automatically Appear Here And On Your Public Page.
              </div>
            </div>
            <button
              onClick={() => window.open('/commander/tournaments', '_blank')}
              style={{ ...btnPrimary, whiteSpace: 'nowrap', fontSize: 12 }}
            >
              Open Commander
            </button>
          </div>
          {/* Auto-published tournament list (read-only) */}
          {tournaments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: C.textSec }}>
              <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>
                No Tournaments Yet
              </div>
              <p style={{ margin: 0, fontSize: 14 }}>
                Add Tournaments Through Club Commander To See Them Here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tournaments.map((t, i) => {
                const d = t.scheduled_start ? new Date(t.scheduled_start) : null;
                const GLABELS = {
                  NLH: "NL Hold'em",
                  PLO: 'PLO',
                  PLO5: 'PLO-5',
                  PLO8: 'PLO Hi-Lo',
                  nlh: "NL Hold'em",
                  plo: 'PLO',
                  plo5: 'PLO-5',
                  plo8: 'PLO Hi-Lo',
                  mixed: 'Mixed',
                  limit: 'Limit',
                  stud: 'Stud',
                  razz: 'Razz',
                };
                const isLive = ['running', 'break', 'final_table'].includes(t.status);
                const isCompleted = t.status === 'completed';
                const statusColor = isLive ? '#42B72A' : isCompleted ? '#B0B3B8' : '#1877F2';
                const statusLabel = isLive
                  ? t.status === 'break'
                    ? 'BREAK'
                    : t.status === 'final_table'
                      ? 'FINAL TABLE'
                      : 'LIVE'
                  : isCompleted
                    ? 'Completed'
                    : 'Upcoming';
                const prizePool = (t.current_entries || 0) * (t.buyin_amount || 0);
                return (
                  <div
                    key={t.id || i}
                    onClick={() =>
                      t.id && window.open(`/commander/tournaments/${t.id}/public`, '_blank')
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      background: isLive ? 'rgba(66,183,42,0.04)' : '#f5f5f5',
                      borderRadius: 10,
                      border: isLive ? '1px solid rgba(66,183,42,0.25)' : '1px solid #e4e6eb',
                      cursor: t.id ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                    }}
                  >
                    {d && (
                      <div
                        style={{
                          minWidth: 44,
                          textAlign: 'center',
                          background: '#fff',
                          borderRadius: 8,
                          padding: '4px 6px',
                          border: '1px solid #e4e6eb',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: C.textSec,
                            textTransform: 'uppercase',
                            fontWeight: 700,
                          }}
                        >
                          {d.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
                          {d.getDate()}
                        </div>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: C.text,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.name}
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: statusColor,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isLive
                              ? 'rgba(66,183,42,0.12)'
                              : isCompleted
                                ? 'rgba(176,179,184,0.12)'
                                : 'rgba(24,119,242,0.08)',
                          }}
                        >
                          {isLive && (
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: '#42B72A',
                                animation: 'pulse 1.5s infinite',
                              }}
                            />
                          )}
                          {statusLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                        {d
                          ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          : ''}
                        {t.game_type ? ` · ${GLABELS[t.game_type] || t.game_type}` : ''}
                        {t.buyin_amount ? ` · $${t.buyin_amount} Buy-in` : ''}
                        {t.guaranteed_prize ? ` · $${t.guaranteed_prize.toLocaleString()} GTD` : ''}
                      </div>
                      {(isLive || isCompleted) && (
                        <div
                          style={{
                            fontSize: 11,
                            color: isLive ? '#42B72A' : C.textSec,
                            marginTop: 3,
                            fontWeight: 600,
                          }}
                        >
                          {isLive && t.players_remaining
                            ? `${t.players_remaining} players remaining`
                            : ''}
                          {isLive && t.players_remaining && prizePool > 0 ? ' · ' : ''}
                          {prizePool > 0 ? `$${prizePool.toLocaleString()} prize pool` : ''}
                          {isLive && !t.players_remaining && t.current_entries
                            ? `${t.current_entries} entries`
                            : ''}
                        </div>
                      )}
                    </div>
                    {t.id && <span style={{ fontSize: 14, color: C.textSec }}>›</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Amenities Tab */}
      {activeTab === 'amenities' && (
        <div style={cardSt}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
              Venue Amenities
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {savedBadge}
              <button
                onClick={() => saveMetadata({ amenities }, 'Amenities saved!')}
                disabled={metaSaving}
                style={{ ...btnPrimary, opacity: metaSaving ? 0.5 : 1 }}
              >
                {metaSaving ? 'Saving...' : 'Save Amenities'}
              </button>
            </div>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textSec }}>
            Toggle The Amenities Your Venue Offers. Visitors Will See These On Your Public Page.
          </p>
          {AMENITIES_LIST.map((cat) => (
            <div key={cat.cat} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.blue,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {cat.cat}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 4,
                }}
              >
                {cat.items.map((item) => (
                  <label
                    key={item.k}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: amenities[item.k] ? 'rgba(24,119,242,0.08)' : '#f5f5f5',
                      border: `1px solid ${amenities[item.k] ? 'rgba(24,119,242,0.3)' : '#e4e6eb'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!amenities[item.k]}
                      onChange={(e) =>
                        setAmenities((prev) => ({ ...prev, [item.k]: e.target.checked }))
                      }
                      style={{ width: 16, height: 16, accentColor: C.blue }}
                    />
                    <span style={{ fontSize: 13, color: C.text }}>{item.l}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Follow Requests — visible above all tabs */}
      {pendingFollowers.length > 0 && (
        <div style={{ ...cardSt, marginBottom: 8 }}>
          <div
            style={{
              marginBottom: 0,
              borderRadius: 10,
              border: '2px solid #f59e0b',
              background: '#fffbeb',
              padding: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
              Pending Follow Requests ({pendingFollowers.length})
            </div>
            {pendingFollowers.map((f) => (
              <div
                key={f.user_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid #fde68a',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#fed7aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#92400e"
                      strokeWidth="2"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                      {f.profile?.username || f.profile?.full_name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: C.textSec }}>
                      {f.profile?.username
                        ? `@${f.profile.username}`
                        : `Requested ${new Date(f.created_at).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleApproveFollower(f.user_id, 'approve')}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 20,
                      border: 'none',
                      background: '#22c55e',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      minWidth: 80,
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleApproveFollower(f.user_id, 'reject')}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 20,
                      border: 'none',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      minWidth: 70,
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Games Tab — Read-Only Commander Status */}
      {activeTab === 'live_games' && (
        <div style={cardSt}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
              Live Game Board
            </h3>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/hub/commander"
              style={{ fontSize: 13, fontWeight: 600, color: C.blue, textDecoration: 'none' }}
            >
              Manage In Club Commander &rarr;
            </a>
          </div>

          <div
            style={{
              fontSize: 12,
              color: C.textSec,
              padding: '8px 12px',
              background: '#f0f7ff',
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            Live games are managed through Club Commander. This board shows the current game status
            in real-time.
          </div>

          {/* Read-Only Games List */}
          {loadingGames ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid #E4E6EB',
                  borderTopColor: C.blue,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 12px',
                }}
              />
              Loading games...
            </div>
          ) : liveGames.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M12 8v4l3 3" />
                </svg>
              </div>
              <div style={{ fontSize: 18, marginBottom: 6, fontWeight: 700, color: C.text }}>
                No Active Games
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                Open Club Commander To Create And Manage Live Games
              </p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/hub/commander"
                style={{
                  display: 'inline-block',
                  padding: '10px 24px',
                  borderRadius: 8,
                  background: C.blue,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Open Club Commander
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {liveGames.map((game) => {
                const seatArr = Array.from({ length: game.max_seats }, (_, i) => {
                  const taken = (game.seats || []).find(
                    (s) => s.seat_number === i + 1 && s.status !== 'waitlist'
                  );
                  return { number: i + 1, taken };
                });
                const waitlist = (game.seats || [])
                  .filter((s) => s.status === 'waitlist')
                  .sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
                const occupiedCount = seatArr.filter((s) => s.taken).length;
                const openSeats = game.max_seats - occupiedCount;

                // Arc-length parameterized ellipse: equal visual spacing
                const rx = 47,
                  ry = 22,
                  cxE = 50,
                  cyE = 50;
                const STEPS = 360;
                const startAngle = Math.PI / 2; // dealer at bottom (90°)
                const cumArc = [0];
                for (let i = 1; i <= STEPS; i++) {
                  const t0 = startAngle + ((i - 1) / STEPS) * 2 * Math.PI;
                  const t1 = startAngle + (i / STEPS) * 2 * Math.PI;
                  const dx = rx * (Math.cos(t1) - Math.cos(t0));
                  const dy = ry * (Math.sin(t1) - Math.sin(t0));
                  cumArc.push(cumArc[i - 1] + Math.sqrt(dx * dx + dy * dy));
                }
                const totalArc = cumArc[STEPS];
                const allPos = [];
                for (let p = 0; p < 10; p++) {
                  const target = (p / 10) * totalArc;
                  let idx = 1;
                  while (idx <= STEPS && cumArc[idx] < target) idx++;
                  const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
                  allPos.push({
                    top: `${cyE + ry * Math.sin(angle)}%`,
                    left: `${cxE + rx * Math.cos(angle)}%`,
                  });
                }
                // pos[0]=dealer(bottom), pos[1-9]=seats going counter-clockwise
                const dealerTop = allPos[0].top;
                const dealerLeft = allPos[0].left;
                const seatPositions = allPos.slice(1);
                // Clamp top seat to not float above rail
                seatPositions.forEach((p) => {
                  const t = parseFloat(p.top);
                  if (t < 30) p.top = '30%';
                });

                return (
                  <div
                    key={game.id}
                    style={{
                      background: '#1a1a2e',
                      borderRadius: 16,
                      border: '1px solid #2d2d44',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Game Header */}
                    <div
                      style={{
                        padding: '12px 16px',
                        background:
                          game.status === 'running'
                            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                            : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                        color: '#fff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800 }}>{game.game_name}</div>
                          <div style={{ fontSize: 13, opacity: 0.9 }}>
                            {game.game_type} &middot; ${game.stakes} &middot; {game.max_seats}-max
                            {game.table_number ? ` · ${game.table_number}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              background: 'rgba(255,255,255,0.2)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {game.status === 'running' ? '🟢 RUNNING' : '🔵 OPEN'}
                          </span>
                          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
                            {occupiedCount}/{game.max_seats} seated
                            {openSeats > 0 && (
                              <span style={{ color: '#86efac', marginLeft: 4 }}>
                                ({openSeats} open)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Poker Table Visualization — Full Width (cropped viewport) */}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        paddingBottom: '64%',
                        overflow: 'hidden',
                        marginTop: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          aspectRatio: '1 / 1',
                          marginTop: '-18%',
                        }}
                      >
                        {/* Table image fills entire container */}
                        <img
                          src="/images/poker-table-black-gold.png"
                          alt="Poker Table"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            pointerEvents: 'none',
                            zIndex: 0,
                          }}
                        />

                        {/* Game info in center of table */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '48%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 5,
                            textAlign: 'center',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'rgba(255,255,255,0.5)',
                              textTransform: 'uppercase',
                              letterSpacing: 1.5,
                              marginBottom: 4,
                            }}
                          >
                            {page.name || 'Club'}
                          </div>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 800,
                              color: 'rgba(255,255,255,0.85)',
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                            }}
                          >
                            {game.table_number || game.game_name}
                          </div>
                          <div
                            style={{
                              fontSize: 16,
                              color: 'rgba(255,255,255,0.6)',
                              marginTop: 2,
                              fontWeight: 700,
                            }}
                          >
                            ${game.stakes}
                          </div>
                        </div>

                        {/* Dealer seat — on the bottom rail of the table */}
                        <div
                          style={{
                            position: 'absolute',
                            top: dealerTop,
                            left: dealerLeft,
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center',
                            width: 90,
                            zIndex: 3,
                          }}
                        >
                          <div
                            style={{
                              width: 80,
                              height: 80,
                              borderRadius: '50%',
                              margin: '0 auto 4px',
                              background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                              border: '3px solid #E4E6EB',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow:
                                '0 2px 12px rgba(0,0,0,0.6), 0 0 16px rgba(24,119,242,0.4)',
                              fontSize: 32,
                              fontWeight: 900,
                              color: '#fff',
                              letterSpacing: 1,
                            }}
                          >
                            D
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: '#1877F2',
                              maxWidth: 120,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {game.dealer_name || 'No Dealer'}
                          </div>
                        </div>

                        {/* 9 Player seat chips on the table rail */}
                        {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                          const pos = seatPositions[idx];
                          const isOccupied = !!seat.taken;
                          const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                          const fullName = seat.taken?.player_name || '';
                          const avatarUrl = seat.taken?.avatar_url || null;
                          // Direction-aware badge: left-side extends right, right-side extends left
                          const leftPct = parseFloat(pos.left);
                          const isLeftSide = leftPct < 25;
                          const isRightSide = leftPct > 75;
                          const badgeTransform = isLeftSide
                            ? 'translate(-17px, -50%)'
                            : isRightSide
                              ? 'translate(calc(-100% + 17px), -50%)'
                              : 'translate(-50%, -50%)';
                          const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                          // Timer computation
                          let timerText = null,
                            timerColor = null;
                          if (isOccupied) {
                            const session = (game.sessions || []).find(
                              (s) => s.seat_number === seat.number
                            );
                            if (session) {
                              const isTexas = game.venue_type === 'texas';
                              if (isTexas) {
                                const rem = Math.max(0, (session.time_remaining || 0) - timerTick);
                                const mins = Math.floor(rem / 60);
                                const secs = rem % 60;
                                timerText = `${mins}:${String(secs).padStart(2, '0')}`;
                                const isExpired = rem <= 0;
                                const isCritical = rem <= 300 && rem > 0;
                                const isLow = rem <= 900 && rem > 0;
                                timerColor = isExpired
                                  ? '#ef4444'
                                  : isCritical
                                    ? '#ef4444'
                                    : isLow
                                      ? '#f59e0b'
                                      : '#22c55e';
                                if (isExpired) timerText = 'EXPIRED';
                              } else {
                                const elapsed = (session.elapsed_seconds || 0) + timerTick;
                                const hrs = Math.floor(elapsed / 3600);
                                const mins = Math.floor((elapsed % 3600) / 60);
                                timerText = `${hrs}:${String(mins).padStart(2, '0')}`;
                                timerColor = '#a78bfa';
                              }
                            }
                          }

                          return (
                            <div
                              key={seat.number}
                              style={{
                                position: 'absolute',
                                top: pos.top,
                                left: pos.left,
                                transform: badgeTransform,
                                zIndex: 2,
                                display: 'flex',
                                flexDirection: badgeDirection,
                                alignItems: 'center',
                                gap: 10,
                                background: 'rgba(36,37,38,0.9)',
                                borderRadius: 14,
                                padding: '6px 12px 6px 6px',
                                border: `2px solid ${isOccupied ? 'rgba(24,119,242,0.5)' : 'rgba(62,64,66,0.6)'}`,
                                backdropFilter: 'blur(6px)',
                                minWidth: 80,
                              }}
                            >
                              {/* Avatar circle */}
                              <div
                                style={{
                                  width: 68,
                                  height: 68,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: isOccupied
                                    ? avatarUrl
                                      ? 'transparent'
                                      : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)'
                                    : 'rgba(255,255,255,0.06)',
                                  border: `2px solid ${isOccupied ? '#1877F2' : 'rgba(62,64,66,0.5)'}`,
                                  overflow: 'hidden',
                                }}
                              >
                                {isOccupied ? (
                                  avatarUrl ? (
                                    <img
                                      src={avatarUrl}
                                      alt={firstName}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        borderRadius: '50%',
                                      }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>
                                      {firstName.charAt(0).toUpperCase()}
                                    </span>
                                  )
                                ) : (
                                  <span style={{ fontSize: 18, fontWeight: 600, color: '#B0B3B8' }}>
                                    {seat.number}
                                  </span>
                                )}
                              </div>
                              {/* Name + Timer text */}
                              <div
                                style={{
                                  overflow: 'hidden',
                                  textAlign: isRightSide ? 'right' : 'left',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 600,
                                    lineHeight: 1.2,
                                    color: isOccupied ? '#E4E6EB' : '#B0B3B8',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 140,
                                  }}
                                >
                                  {isOccupied ? fullName : 'Open'}
                                </div>
                                {timerText && (
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 700,
                                      color: timerColor,
                                      fontFamily: 'monospace',
                                      lineHeight: 1.2,
                                      animation:
                                        timerColor === '#ef4444' ? 'pulse 1s infinite' : 'none',
                                    }}
                                  >
                                    {timerText}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Waitlist — Read Only */}
                    {waitlist.length > 0 && (
                      <div
                        style={{
                          padding: '8px 16px 12px',
                          background: '#1a1a2e',
                          borderTop: '1px solid #2d2d44',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#f59e0b',
                            marginBottom: 4,
                          }}
                        >
                          Waitlist
                        </div>
                        {waitlist.map((w, i) => (
                          <div
                            key={w.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '2px 0',
                              fontSize: 11,
                            }}
                          >
                            <span style={{ color: '#d4d4d8' }}>
                              #{w.waitlist_position || i + 1} - {w.player_name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* About Tab */}
      {activeTab === 'about' && (
        <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: C.text }}>
            About
          </h3>
          {page.description && (
            <p style={{ margin: '0 0 12px', fontSize: 14, color: C.text, lineHeight: 1.5 }}>
              {page.description}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {page.category && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.textSec}
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                </svg>
                <span style={{ fontSize: 14, color: C.text }}>
                  {CATEGORY_LABELS[page.category] || page.category}
                </span>
              </div>
            )}
            {(page.location_city || page.location_state) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.textSec}
                  strokeWidth="2"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span style={{ fontSize: 14, color: C.text }}>
                  {[page.location_city, page.location_state].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {page.website && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.textSec}
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <a
                  href={page.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 14, color: C.blue }}
                >
                  {page.website}
                </a>
              </div>
            )}
            {page.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.textSec}
                  strokeWidth="2"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
                </svg>
                <span style={{ fontSize: 14, color: C.text }}>{page.phone}</span>
              </div>
            )}
          </div>
          <div style={{ marginTop: 16, padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.textSec }}>
              Page created{' '}
              {page.created_at ? new Date(page.created_at).toLocaleDateString() : 'recently'}
            </span>
          </div>
        </div>
      )}

      {/* Floating Green Live Events Button */}
      {(() => {
        const liveTourneys = tournaments.filter((t) =>
          ['running', 'break', 'final_table'].includes(t.status)
        );
        if (liveTourneys.length === 0) return null;
        const lt = liveTourneys[0];
        return (
          <div
            onClick={() => lt.id && window.open(`/commander/tournaments/${lt.id}/public`, '_blank')}
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1000,
              cursor: lt.id ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 22px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              borderRadius: 50,
              boxShadow: '0 4px 24px rgba(34,197,94,0.45), 0 0 0 3px rgba(34,197,94,0.15)',
              color: '#fff',
              fontFamily: 'inherit',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow =
                '0 6px 28px rgba(34,197,94,0.55), 0 0 0 4px rgba(34,197,94,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow =
                '0 4px 24px rgba(34,197,94,0.45), 0 0 0 3px rgba(34,197,94,0.15)';
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 0 6px rgba(255,255,255,0.8)',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
              🏆 LIVE EVENT{liveTourneys.length > 1 ? `S (${liveTourneys.length})` : ''}
            </span>
            <span style={{ fontSize: 12, opacity: 0.9, fontWeight: 500 }}>{lt.name}</span>
          </div>
        );
      })()}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

// ===== PUBLIC GAME BOARD (Player Signup View) =====
function PublicGameBoard({ C, pageId, pageName, userId, userName, onClose }) {
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gameSource, setGameSource] = useState(null); // 'commander' or null
  const [commanderVenueId, setCommanderVenueId] = useState(null);
  const [playerName, setPlayerName] = useState(userName || '');
  // Sync playerName when userName prop updates (arrives async after auth)
  useEffect(() => {
    if (userName && !playerName) setPlayerName(userName);
  }, [userName]);
  const [actionMsg, setActionMsg] = useState('');
  const [followStatus, setFollowStatus] = useState(null); // null = not checked, 'none' | 'pending' | 'approved'
  const [followLoading, setFollowLoading] = useState(true);
  // Timer tick for live countdown clocks
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTimerTick((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Check follow status
  const checkFollowStatus = async () => {
    if (!userId) {
      setFollowStatus('none');
      setFollowLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/social/pages/follow?page_id=${pageId}&requester_id=${userId}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        setFollowStatus(json.my_status || (json.is_following ? 'approved' : 'none'));
      } else {
        setFollowStatus('none');
      }
    } catch {
      setFollowStatus('none');
    }
    setFollowLoading(false);
  };

  const fetchGames = async () => {
    try {
      const res = await fetch(`/api/social/pages/games?page_id=${pageId}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        setGames(json.data || []);
        setTimerTick(0);
        if (json.source === 'commander' && json.venue_id) {
          setGameSource('commander');
          setCommanderVenueId(json.venue_id);
        }
      }
    } catch (e) {
      console.warn('Public games fetch error:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    checkFollowStatus();
    fetchGames();
    const interval = setInterval(fetchGames, 15000);
    return () => clearInterval(interval);
  }, [pageId]);

  const showMsg = (msg) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleFollow = async () => {
    if (!userId) {
      showMsg('You must be logged in to follow this page');
      return;
    }
    if (followLoading) return;
    setFollowLoading(true);

    // EAGER STATE: Show optimistic pending state immediately
    const prevStatus = followStatus;
    setFollowStatus('pending');

    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/pages/follow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ page_id: pageId, user_id: userId, action: 'follow' }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        const newStatus = json.status || 'approved';
        setFollowStatus(newStatus);
        if (newStatus === 'pending') showMsg('Follow request sent! Waiting for approval.');
        else showMsg('You are now following this page!');
      } else {
        setFollowStatus(prevStatus);
        showMsg(json.error || 'Could not follow page');
      }
    } catch {
      setFollowStatus(prevStatus);
      showMsg('Error following page');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleTakeSeat = async (gameId, seatNumber) => {
    if (!playerName.trim()) {
      showMsg('Please enter your name first');
      return;
    }
    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/pages/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'take_seat',
          game_id: gameId,
          seat_number: seatNumber,
          player_id: userId || null,
          player_name: playerName.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        showMsg(`Seat ${seatNumber} reserved!`);
        fetchGames();
      } else {
        showMsg(json.error || 'Could not take seat');
      }
    } catch (e) {
      showMsg('Error reserving seat');
    }
  };

  const handleJoinWaitlist = async (gameId) => {
    if (!playerName.trim()) {
      showMsg('Please enter your name first');
      return;
    }
    // Commander games: navigate to the Commander waitlist page
    if (gameSource === 'commander' && commanderVenueId) {
      router.push(`/hub/commander/waitlist/${commanderVenueId}`);
      return;
    }
    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/pages/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'join_waitlist',
          game_id: gameId,
          player_id: userId || null,
          player_name: playerName.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        showMsg(`Added to waitlist (position #${json.position})`);
        fetchGames();
      } else {
        showMsg(json.error || 'Could not join waitlist');
      }
    } catch (e) {
      showMsg('Error joining waitlist');
    }
  };

  const handleLeave = async (gameId) => {
    if (!playerName.trim()) return;
    try {
      const token = getAccessToken();
      await fetch('/api/social/pages/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'leave', game_id: gameId, player_name: playerName.trim() }),
      });
      showMsg('You have been removed from the game');
      fetchGames();
    } catch (e) {
      showMsg('Error leaving game');
    }
  };

  const canInteract = followStatus === 'approved';

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 8,
          color: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Live Games</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, opacity: 0.8 }}>
              {pageName || 'Club Games'}
            </p>
          </div>
          {onClose && (
            <button
              onClick={() => (onClose ? onClose() : router.back())}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← Back
            </button>
          )}
        </div>

        {/* Follow Status Banner */}
        {followLoading ? (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.1)',
              fontSize: 13,
            }}
          >
            Checking Access...
          </div>
        ) : followStatus === 'none' ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(24,119,242,0.3)',
              border: '1px solid rgba(24,119,242,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Follow To Play</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  You Must Follow This Page Before You Can Sign Up For Games.
                </div>
              </div>
              <button
                onClick={handleFollow}
                style={{
                  padding: '8px 20px',
                  borderRadius: 20,
                  border: 'none',
                  background: '#1877F2',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {!userId ? '🔒 Sign In' : '➕ Follow Page'}
              </button>
            </div>
          </div>
        ) : followStatus === 'pending' ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(245,158,11,0.2)',
              border: '1px solid rgba(245,158,11,0.5)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>⏳ Follow Request Pending</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              The Host Needs To Approve Your Request Before You Can Sign Up For Games. Check Back
              Soon!
            </div>
          </div>
        ) : (
          <>
            {/* Player Name — locked to Smarter Poker profile name */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Signed In As:</label>
              <span
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              >
                {playerName || 'Player'}
              </span>
            </div>
          </>
        )}
        {actionMsg && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 12px',
              borderRadius: 6,
              background:
                actionMsg.includes('Error') ||
                actionMsg.includes('Please') ||
                actionMsg.includes('Could not') ||
                actionMsg.includes('must')
                  ? 'rgba(240,40,73,0.2)'
                  : 'rgba(34,197,94,0.2)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {actionMsg}
          </div>
        )}
      </div>

      {/* Games */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #E4E6EB',
              borderTopColor: '#1877F2',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          Loading live games...
        </div>
      ) : games.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Live Games</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
            No Live Games Right Now
          </p>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
            Check Back Soon For Upcoming Games!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {games.map((game) => {
            const seatArr = Array.from({ length: game.max_seats }, (_, i) => {
              const taken = (game.seats || []).find(
                (s) => s.seat_number === i + 1 && s.status !== 'waitlist'
              );
              return { number: i + 1, taken };
            });
            const waitlist = (game.seats || [])
              .filter((s) => s.status === 'waitlist')
              .sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
            const occupiedCount = seatArr.filter((s) => s.taken).length;
            const openSeats = game.max_seats - occupiedCount;
            const myReservation = (game.seats || []).find(
              (s) => s.player_name === playerName.trim()
            );

            // Arc-length parameterized ellipse: equal visual spacing
            const rx = 47,
              ry = 22,
              cxE = 50,
              cyE = 50;
            const STEPS = 360;
            const startAngle = Math.PI / 2; // dealer at bottom (90°)
            const cumArc = [0];
            for (let i = 1; i <= STEPS; i++) {
              const t0 = startAngle + ((i - 1) / STEPS) * 2 * Math.PI;
              const t1 = startAngle + (i / STEPS) * 2 * Math.PI;
              const dx = rx * (Math.cos(t1) - Math.cos(t0));
              const dy = ry * (Math.sin(t1) - Math.sin(t0));
              cumArc.push(cumArc[i - 1] + Math.sqrt(dx * dx + dy * dy));
            }
            const totalArc = cumArc[STEPS];
            const allPos = [];
            for (let p = 0; p < 10; p++) {
              const target = (p / 10) * totalArc;
              let idx = 1;
              while (idx <= STEPS && cumArc[idx] < target) idx++;
              const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
              allPos.push({
                top: `${cyE + ry * Math.sin(angle)}%`,
                left: `${cxE + rx * Math.cos(angle)}%`,
              });
            }
            // pos[0]=dealer(bottom), pos[1-9]=seats going counter-clockwise
            const dealerTop = allPos[0].top;
            const dealerLeft = allPos[0].left;
            const seatPositions = allPos.slice(1);
            // Clamp top seat to not float above rail
            seatPositions.forEach((p) => {
              const t = parseFloat(p.top);
              if (t < 30) p.top = '30%';
            });

            return (
              <div
                key={game.id}
                style={{
                  background: '#1a1a2e',
                  borderRadius: 16,
                  border: '1px solid #2d2d44',
                  overflow: 'hidden',
                }}
              >
                {/* Game Header */}
                <div
                  style={{
                    padding: '12px 16px',
                    background:
                      game.status === 'running'
                        ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                        : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                    color: '#fff',
                  }}
                >
                  {/* Interest List banner for non-running games */}
                  {game.status !== 'running' && (
                    <div
                      style={{
                        textAlign: 'center',
                        marginBottom: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.7)',
                      }}
                    >
                      INTEREST LIST
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{game.game_name}</div>
                      <div style={{ fontSize: 13, opacity: 0.9 }}>
                        {game.game_type} · ${game.stakes} · {game.max_seats}-max
                        {game.table_number ? ` · ${game.table_number}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.2)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {game.status === 'running' ? '🟢 RUNNING' : '🔵 INTEREST LIST'}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                        {occupiedCount}/{game.max_seats} seated
                        {openSeats > 0 && (
                          <span style={{ color: '#86efac', marginLeft: 4 }}>
                            ({openSeats} open)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {game.notes && (
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{game.notes}</div>
                  )}
                </div>

                {/* Follow-gate / My seat status — above table */}
                <div style={{ padding: '0 16px' }}>
                  {!canInteract && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(245,158,11,0.15)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        marginBottom: 8,
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>
                        {followStatus === 'pending'
                          ? '⏳ Approval pending - you can view but not join yet'
                          : '🔒 Follow this page to sign up for games'}
                      </span>
                    </div>
                  )}

                  {myReservation && (
                    <div
                      style={{
                        marginBottom: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background:
                          myReservation.status === 'waitlist'
                            ? 'rgba(245,158,11,0.15)'
                            : 'rgba(34,197,94,0.15)',
                        border: `1px solid ${myReservation.status === 'waitlist' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                        {myReservation.status === 'waitlist'
                          ? `📋 You're #${myReservation.waitlist_position} on the waitlist`
                          : `✅ You have Seat ${myReservation.seat_number}`}
                      </span>
                      <button
                        onClick={() => handleLeave(game.id)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 20,
                          border: 'none',
                          background: '#F02849',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Leave
                      </button>
                    </div>
                  )}
                </div>

                {/* Poker Table Visualization — Full Width (cropped viewport) */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    paddingBottom: '64%',
                    overflow: 'hidden',
                    marginTop: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      aspectRatio: '1 / 1',
                      marginTop: '-18%',
                    }}
                  >
                    {/* Table image fills entire container */}
                    <img
                      src="/images/poker-table-black-gold.png"
                      alt="Poker Table"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />

                    {/* Game info in center of table */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '48%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 5,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.5)',
                          textTransform: 'uppercase',
                          letterSpacing: 1.5,
                          marginBottom: 4,
                        }}
                      >
                        {pageName || 'Club'}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: 'rgba(255,255,255,0.85)',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {game.table_number || game.game_name}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          color: 'rgba(255,255,255,0.6)',
                          marginTop: 2,
                          fontWeight: 700,
                        }}
                      >
                        ${game.stakes}
                      </div>
                      {canInteract && !myReservation && (
                        <div
                          style={{
                            fontSize: 11,
                            color: game.status === 'running' ? '#93c5fd' : '#86efac',
                            marginTop: 6,
                            fontWeight: 600,
                          }}
                        >
                          {game.status === 'running' ? 'JOIN WAITLIST' : 'TAP A SEAT TO RESERVE'}
                        </div>
                      )}
                    </div>

                    {/* Dealer seat — on the bottom rail of the table (clickable → Dealer Tablet) */}
                    <div
                      style={{
                        position: 'absolute',
                        top: dealerTop,
                        left: dealerLeft,
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        width: 90,
                        zIndex: 3,
                        cursor: 'pointer',
                      }}
                      onClick={() =>
                        window.open(`/commander/dealer/${game.table_number || 1}`, '_blank')
                      }
                    >
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: '50%',
                          margin: '0 auto 4px',
                          background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                          border: '3px solid #E4E6EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 16px rgba(24,119,242,0.4)',
                          fontSize: 32,
                          fontWeight: 900,
                          color: '#fff',
                          letterSpacing: 1,
                          transition: 'transform 0.15s',
                        }}
                      >
                        D
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#1877F2',
                          maxWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {game.dealer_name || 'No Dealer'}
                      </div>
                    </div>

                    {/* 9 Player seat chips on the table rail */}
                    {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                      const pos = seatPositions[idx];
                      const isOccupied = !!seat.taken;
                      const isMe = seat.taken?.player_name === playerName.trim();
                      const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                      const fullName = seat.taken?.player_name || '';
                      const avatarUrl = seat.taken?.avatar_url || null;
                      // Players can only click seats if game is NOT running (interest list / signup)
                      // Running games require joining the waitlist instead
                      const isRunning = game.status === 'running';
                      const canClick = canInteract && !isOccupied && !myReservation && !isRunning;

                      // Direction-aware badge: left-side extends right, right-side extends left
                      const leftPct = parseFloat(pos.left);
                      const isLeftSide = leftPct < 25;
                      const isRightSide = leftPct > 75;
                      const badgeTransform = isLeftSide
                        ? 'translate(-17px, -50%)'
                        : isRightSide
                          ? 'translate(calc(-100% + 17px), -50%)'
                          : 'translate(-50%, -50%)';
                      const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                      // Timer computation
                      let timerText = null,
                        timerColor = null;
                      if (isOccupied) {
                        const session = (game.sessions || []).find(
                          (s) => s.seat_number === seat.number
                        );
                        if (session) {
                          const isTexas = game.venue_type === 'texas';
                          if (isTexas) {
                            const rem = Math.max(0, (session.time_remaining || 0) - timerTick);
                            const mins = Math.floor(rem / 60);
                            const secs = rem % 60;
                            timerText = `${mins}:${String(secs).padStart(2, '0')}`;
                            const isExpired = rem <= 0;
                            const isCritical = rem <= 300 && rem > 0;
                            const isLow = rem <= 900 && rem > 0;
                            timerColor = isExpired
                              ? '#ef4444'
                              : isCritical
                                ? '#ef4444'
                                : isLow
                                  ? '#f59e0b'
                                  : '#22c55e';
                            if (isExpired) timerText = 'EXPIRED';
                          } else {
                            const elapsed = (session.elapsed_seconds || 0) + timerTick;
                            const hrs = Math.floor(elapsed / 3600);
                            const mins = Math.floor((elapsed % 3600) / 60);
                            timerText = `${hrs}:${String(mins).padStart(2, '0')}`;
                            timerColor = '#a78bfa';
                          }
                        }
                      }

                      // Badge border color (SmarterPoker dark)
                      const badgeBorder = isMe
                        ? 'rgba(74,222,128,0.6)'
                        : isOccupied
                          ? 'rgba(24,119,242,0.5)'
                          : canClick
                            ? 'rgba(34,197,94,0.3)'
                            : 'rgba(62,64,66,0.6)';

                      return (
                        <div
                          key={seat.number}
                          style={{
                            position: 'absolute',
                            top: pos.top,
                            left: pos.left,
                            transform: badgeTransform,
                            zIndex: 2,
                            display: 'flex',
                            flexDirection: badgeDirection,
                            alignItems: 'center',
                            gap: 10,
                            background: 'rgba(36,37,38,0.9)',
                            borderRadius: 14,
                            padding: '6px 12px 6px 6px',
                            border: `2px solid ${badgeBorder}`,
                            backdropFilter: 'blur(6px)',
                            cursor: canClick ? 'pointer' : 'default',
                            minWidth: 80,
                          }}
                          onClick={() => canClick && handleTakeSeat(game.id, seat.number)}
                        >
                          {/* Avatar circle */}
                          <div
                            style={{
                              width: 68,
                              height: 68,
                              borderRadius: '50%',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isMe
                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                : isOccupied
                                  ? avatarUrl
                                    ? 'transparent'
                                    : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)'
                                  : canClick
                                    ? 'rgba(34,197,94,0.15)'
                                    : 'rgba(255,255,255,0.06)',
                              border: `2px solid ${isMe ? '#4ade80' : isOccupied ? '#1877F2' : canClick ? 'rgba(34,197,94,0.4)' : 'rgba(62,64,66,0.5)'}`,
                              overflow: 'hidden',
                            }}
                          >
                            {isOccupied ? (
                              isMe ? (
                                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                                  YOU
                                </span>
                              ) : avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={firstName}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%',
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>
                                  {firstName.charAt(0).toUpperCase()}
                                </span>
                              )
                            ) : (
                              <span
                                style={{
                                  fontSize: canClick ? 22 : 18,
                                  fontWeight: 600,
                                  color: canClick ? 'rgba(34,197,94,0.7)' : '#B0B3B8',
                                }}
                              >
                                {canClick ? '+' : seat.number}
                              </span>
                            )}
                          </div>
                          {/* Name + Timer text */}
                          <div
                            style={{
                              overflow: 'hidden',
                              textAlign: isRightSide ? 'right' : 'left',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 600,
                                lineHeight: 1.2,
                                color: isMe
                                  ? '#4ade80'
                                  : isOccupied
                                    ? '#E4E6EB'
                                    : canClick
                                      ? 'rgba(34,197,94,0.5)'
                                      : '#B0B3B8',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 140,
                              }}
                            >
                              {isMe ? 'You' : isOccupied ? fullName : canClick ? 'Reserve' : 'Open'}
                            </div>
                            {timerText && (
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: timerColor,
                                  fontFamily: 'monospace',
                                  lineHeight: 1.2,
                                  animation:
                                    timerColor === '#ef4444' ? 'pulse 1s infinite' : 'none',
                                }}
                              >
                                {timerText}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Waitlist info */}
                {waitlist.length > 0 && (
                  <div style={{ padding: '6px 16px', fontSize: 11, color: '#a1a1aa' }}>
                    <span style={{ fontWeight: 600, color: '#1877F2' }}>
                      📋 Waitlist: {waitlist.map((w) => w.player_name?.split(' ')[0]).join(', ')}
                    </span>
                  </div>
                )}

                {/* ── Join Waitlist — Large Centered Button ── */}
                {canInteract && !myReservation && (
                  <div style={{ padding: '12px 16px 16px' }}>
                    <button
                      onClick={() => handleJoinWaitlist(game.id)}
                      style={{
                        width: '100%',
                        padding: '16px 24px',
                        borderRadius: 12,
                        border: 'none',
                        background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                        color: '#fff',
                        fontSize: 18,
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        boxShadow: '0 4px 14px rgba(24,119,242,0.4)',
                        transition: 'transform 0.1s, box-shadow 0.1s',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(24,119,242,0.5)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 14px rgba(24,119,242,0.4)';
                      }}
                    >
                      Join Waitlist
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ===== CLUB PAGES VIEW COMPONENT =====
function ClubPagesView({
  C,
  pages,
  setPages,
  loading,
  setLoading,
  category,
  setCategory,
  search,
  setSearch,
  followingIds,
  setFollowingIds,
  onClose,
  onViewLiveGames,
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const [showFollowedOnly, setShowFollowedOnly] = useState(false);
  // Hydration-safe: read localStorage only on the client after mount
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    try {
      setIsStaff(!!JSON.parse(localStorage.getItem('commander_staff') || 'null'));
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  }, []);

  function getAnonUserId() {
    try {
      let uid = localStorage.getItem('sp-anon-uid');
      if (!uid) {
        uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('sp-anon-uid', uid);
      }
      return uid;
    } catch {
      return 'anon-fallback';
    }
  }

  // Fetch pages data — only home_games, charity, clubs (no venues/tours/series)
  useEffect(() => {
    const fetchClubPages = async () => {
      setLoading(true);
      try {
        const uid = getAnonUserId();
        const baseParams = { sort: 'popular', limit: '80' };
        if (search) baseParams.search = search;
        if (uid) baseParams.user_id = uid;
        if (showFollowedOnly) baseParams.followed_only = 'true';

        let allPages = [];
        if (category === 'all') {
          // Fetch home_games, charity, clubs in parallel
          const [hgRes, charRes, clubRes] = await Promise.all(
            ['home_games', 'charity', 'clubs'].map((cat) =>
              fetch(
                `/api/poker/pages?${new URLSearchParams({ ...baseParams, category: cat })}`
              ).then((r) => r.json())
            )
          );
          if (hgRes.success) allPages.push(...(hgRes.data || []));
          if (charRes.success) allPages.push(...(charRes.data || []));
          if (clubRes.success) allPages.push(...(clubRes.data || []));
        } else {
          const res = await fetch(
            `/api/poker/pages?${new URLSearchParams({ ...baseParams, category })}`
          );
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success) allPages = json.data || [];
        }

        setPages(allPages);
        const fSet = new Set();
        allPages.forEach((p) => {
          if (p.is_following) fSet.add(`${p.page_type}:${p.page_id}`);
        });
        setFollowingIds(fSet);
      } catch (e) {
        console.warn('Club pages fetch error:', e);
      }
      setLoading(false);
    };
    fetchClubPages();
  }, [category, search, showFollowedOnly]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handlePageFollow = async (pageType, pageId) => {
    const key = `${pageType}:${pageId}`;
    const isNowFollowing = !followingIds.has(key);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isNowFollowing) next.add(key);
      else next.delete(key);
      return next;
    });
    setPages((prev) =>
      prev.map((p) => {
        if (p.page_type === pageType && p.page_id === pageId) {
          return {
            ...p,
            is_following: isNowFollowing,
            follower_count: isNowFollowing
              ? (p.follower_count || 0) + 1
              : Math.max(0, (p.follower_count || 0) - 1),
          };
        }
        return p;
      })
    );
    try {
      const storageKey = `followed-${pageType === 'venue' ? 'venues' : pageType === 'tour' ? 'tours' : 'series'}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (isNowFollowing) {
        if (!stored.includes(pageId)) stored.push(pageId);
      } else {
        const idx = stored.indexOf(pageId);
        if (idx !== -1) stored.splice(idx, 1);
      }
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
    try {
      const _token = getAccessToken();
      if (!_token) return; // Anonymous users: localStorage-only follow (no server persistence)
      // Only venue/tour/series supported by /api/poker/follow — home_game/charity/club skip server persist
      if (!['venue', 'tour', 'series'].includes(pageType)) return;
      await fetch('/api/poker/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _token },
        body: JSON.stringify({
          page_type: pageType,
          page_id: pageId,
          action: isNowFollowing ? 'follow' : 'unfollow',
        }),
      });
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  };

  const cats = [
    { key: 'all', label: 'All' },
    { key: 'home_games', label: 'Home Games' },
    { key: 'charity', label: 'Charity' },
    { key: 'clubs', label: 'Clubs' },
  ];

  const typeColors = {
    venue: { bg: '#1877F2', light: '#E7F3FF' },
    tour: { bg: '#E74C3C', light: '#FDEDEC' },
    series: { bg: '#F39C12', light: '#FEF5E7' },
    home_game: { bg: '#22C55E', light: '#F0FDF4' },
    charity: { bg: '#A855F7', light: '#FAF5FF' },
    club: { bg: '#0EA5E9', light: '#F0F9FF' },
  };

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Header */}
      <div
        style={{ background: C.card, borderRadius: 12, padding: '16px 16px 12px', marginBottom: 8 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Club Pages</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.textSec }}>
              Follow Home Games, Charity Clubs & More
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isStaff && (
              <button
                onClick={() => (window.top.location.href = '/hub/commander')}
                style={{
                  background: 'linear-gradient(135deg, #1a1a2e, #0f0f0f)',
                  border: '1px solid #22D3EE',
                  borderRadius: 20,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#22D3EE',
                  fontFamily: "'Orbitron', sans-serif",
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 0 8px rgba(34,211,238,0.2)',
                }}
              >
                Commander
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: '#E4E6EB',
                border: 'none',
                borderRadius: 20,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                color: C.text,
                fontFamily: 'inherit',
              }}
            >
              Back To Feed
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search Pages..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px 10px 14px',
              border: '1px solid #CCD0D5',
              borderRadius: 20,
              fontSize: 14,
              background: '#F0F2F5',
              color: C.text,
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('');
                setSearch('');
              }}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#65676B',
                padding: 4,
              }}
            >
              x
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {cats.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                background: category === c.key ? '#1877F2' : '#E4E6EB',
                color: category === c.key ? '#fff' : C.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Following Filter */}
        <button
          onClick={() => setShowFollowedOnly(!showFollowedOnly)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 20,
            border: showFollowedOnly ? '1px solid #1877F2' : '1px solid #CCD0D5',
            background: showFollowedOnly ? '#E7F3FF' : 'transparent',
            color: showFollowedOnly ? '#1877F2' : C.textSec,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={showFollowedOnly ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {showFollowedOnly ? 'Following Only' : 'Show Following'}
        </button>
      </div>

      {/* Pages List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #E4E6EB',
              borderTopColor: '#1877F2',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p>Loading Pages...</p>
        </div>
      ) : pages.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
            {showFollowedOnly ? 'No followed pages' : 'No pages found'}
          </p>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
            {showFollowedOnly
              ? 'Follow some pages to see them here.'
              : 'Try a different search or category.'}
          </p>
          {showFollowedOnly && (
            <button
              onClick={() => setShowFollowedOnly(false)}
              style={{
                marginTop: 12,
                padding: '8px 20px',
                background: '#1877F2',
                border: 'none',
                borderRadius: 20,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Browse All Pages
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pages.map((page) => {
            const tc = typeColors[page.page_type] || typeColors.venue;
            const isFollowing = followingIds.has(`${page.page_type}:${page.page_id}`);
            return (
              <div
                key={`${page.page_type}-${page.page_id}`}
                style={{
                  background: C.card,
                  borderRadius: 10,
                  border: '1px solid #E4E6EB',
                  overflow: 'hidden',
                }}
              >
                {/* Banner */}
                <div
                  style={{
                    background: tc.bg,
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.9)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {page.page_type === 'venue'
                      ? 'Venue'
                      : page.page_type === 'tour'
                        ? 'Tour'
                        : page.page_type === 'series'
                          ? 'Series'
                          : page.page_type === 'home_game'
                            ? 'Home Game'
                            : page.page_type === 'charity'
                              ? 'Charity'
                              : page.page_type === 'club'
                                ? 'Club'
                                : page.page_type}
                  </span>
                  {page.follower_count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                      {page.follower_count} follower{page.follower_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    {page.avatar_url ? (
                      <img
                        src={page.avatar_url}
                        alt=""
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: tc.light,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: tc.bg,
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {page.page_type === 'venue' && (
                            <>
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </>
                          )}
                          {page.page_type === 'tour' && (
                            <>
                              <circle cx="12" cy="12" r="10" />
                              <line x1="2" y1="12" x2="22" y2="12" />
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </>
                          )}
                          {page.page_type === 'series' && (
                            <>
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </>
                          )}
                          {page.page_type === 'home_game' && (
                            <>
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                              <polyline points="9 22 9 12 15 12 15 22" />
                            </>
                          )}
                          {page.page_type === 'charity' && (
                            <>
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </>
                          )}
                          {page.page_type === 'club' && (
                            <>
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </>
                          )}
                        </svg>
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        onClick={() => {
                          if (page.is_social_page) {
                            onViewLiveGames &&
                              onViewLiveGames({ id: page.page_id, name: page.name });
                          } else if (page.detail_url) {
                            router.push(page.detail_url);
                          }
                        }}
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.text,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {page.name}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec }}>
                        {CATEGORY_LABELS[page.category] || page.category}
                      </div>
                      {(page.location_city || page.location_state) && (
                        <div
                          style={{
                            fontSize: 11,
                            color: C.textSec,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {[page.location_city, page.location_state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {page.subtitle && (
                    <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 8px' }}>
                      {page.subtitle}
                    </p>
                  )}

                  {/* Meta tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {page.page_type === 'venue' && page.has_tournaments && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#E7F3FF',
                          color: '#1877F2',
                        }}
                      >
                        Tournaments
                      </span>
                    )}
                    {page.page_type === 'series' && page.total_events && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#FFF4E5',
                          color: '#E67E22',
                        }}
                      >
                        {page.total_events} Events
                      </span>
                    )}
                    {page.page_type === 'series' && page.start_date && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#E8EAF6',
                          color: '#303F9F',
                        }}
                      >
                        {new Date(page.start_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                    {page.page_type === 'tour' && page.established && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#F3E5F5',
                          color: '#7B1FA2',
                        }}
                      >
                        Est. {page.established}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handlePageFollow(page.page_type, page.page_id)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 20,
                        border: 'none',
                        background: isFollowing ? '#E4E6EB' : '#1877F2',
                        color: isFollowing ? C.text : '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                    <button
                      onClick={() => {
                        if (page.is_social_page) {
                          onViewLiveGames && onViewLiveGames({ id: page.page_id, name: page.name });
                        } else if (page.detail_url) {
                          router.push(page.detail_url);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 20,
                        border: 'none',
                        background: '#E4E6EB',
                        color: C.text,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {page.is_social_page ? 'Live Games' : 'View Page'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <button
              onClick={() => router.push('/hub/pages')}
              style={{
                padding: '10px 24px',
                background: '#E4E6EB',
                border: 'none',
                borderRadius: 20,
                color: C.text,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              View All Pages
            </button>
          </div>
        </div>
      )}

      <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
    </div>
  );
}

function SocialMediaPage() {
  const router = useRouter();
  useTrainingBus('social-media');

  // Auto-prefetch profile data when posts scroll into view
  useFeedPrefetchObserver();

  // Zustand Global State (replaces UI-related useState)
  const sidebarOpen = useSocialStore((s) => s.sidebarOpen);
  const setSidebarOpen = useSocialStore((s) => s.setSidebarOpen);
  const showNotifications = useSocialStore((s) => s.showNotifications);
  const setShowNotifications = useSocialStore((s) => s.setShowNotifications);
  const showGlobalSearch = useSocialStore((s) => s.showGlobalSearch);
  const setShowGlobalSearch = useSocialStore((s) => s.setShowGlobalSearch);
  const showGoLiveModal = useSocialStore((s) => s.showGoLiveModal);
  const setShowGoLiveModal = useSocialStore((s) => s.setShowGoLiveModal);

  // 🛡️ INSTANT AUTH: Initialize user synchronously from localStorage
  // Prevents "Log In" flash while async profile fetch completes
  // Priority: sp-social-user cache (has DB username + display pref) → JWT user_metadata (may be stale)
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      // First: try our own profile cache written after DB fetch (always fresh, respects display pref)
      const cached = localStorage.getItem('sp-social-user');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Cache TTL: 1 hour
        if (parsed?.id && parsed?.ts && Date.now() - parsed.ts < 3600000) {
          return {
            id: parsed.id,
            name: parsed.name,
            full_name: parsed.full_name,
            username: parsed.username,
            avatar: parsed.avatar,
            tier: null,
            role: parsed.role || 'user',
            hendon: null,
          };
        }
      }
    } catch (_) {
      /* cache miss */
    }
    try {
      const authUser = getAuthUser();
      if (authUser) {
        // JWT fallback — use full_name by default if available, otherwise alias
        const fullName = authUser.user_metadata?.full_name;
        const alias = authUser.user_metadata?.poker_alias;
        // Read display preference from settings cache
        let pref = 'full_name';
        try {
          const s = JSON.parse(localStorage.getItem('sp-user-settings') || '{}');
          pref = s.display_name_preference || 'full_name';
        } catch (_) {}
        const name = pref === 'username' ? alias || fullName : fullName || alias;
        return {
          id: authUser.id,
          name: name || authUser.email?.split('@')[0] || 'Player',
          full_name: fullName || null,
          username: alias || null,
          avatar: authUser.user_metadata?.avatar_url || null,
          tier: null,
          role: 'user',
          hendon: null,
        };
      }
    } catch (_) {
      console.warn('[App] Handled exception:', _?.message || _);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [searchResults, setSearchResults] = useState([]);

  // showMoreMenu state removed — all sidebar items now always visible
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [deletePostId, setDeletePostId] = useState(null);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [horseProfileIds, setHorseProfileIds] = useState(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState(new Set());
  const undoDeleteRef = useRef(null);
  const [shareModalPost, setShareModalPost] = useState(null);

  // Phase 15: Load horse profile IDs for online presence indicators
  useEffect(() => {
    supabase
      .from('content_authors')
      .select('profile_id')
      .eq('is_active', true)
      .not('profile_id', 'is', null)
      .then(({ data }) => {
        if (data) setHorseProfileIds(new Set(data.map((h) => h.profile_id)));
      });
  }, []);

  // Phase 2: Load blocked user IDs for feed filtering
  useEffect(() => {
    if (!user?.id) return;
    getBlockedUsers(user.id)
      .then((blocked) => {
        setBlockedUserIds(new Set((blocked || []).map((b) => b.blocked_id)));
      })
      .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [user?.id]);

  // Phase 2: Block/hide a user's posts
  const handleBlockUser = async (authorId, authorName) => {
    if (!user?.id || !authorId) return;
    // Optimistically hide their posts
    setBlockedUserIds((prev) => new Set([...prev, authorId]));
    toast.success(`Posts from ${authorName || 'this user'} hidden`, 5000);
    try {
      await blockUser(user.id, authorId);
      broadcastSync('smarter_poker_block_sync', { action: 'block', authorId });
      busEmit.dataMutated('social');
    } catch (e) {
      console.warn('[Social] Block failed:', e);
      // Revert on failure
      setBlockedUserIds((prev) => {
        const s = new Set(prev);
        s.delete(authorId);
        return s;
      });
      toast.error('Could not hide user');
    }
  };
  // Global Search State
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState({ users: [], posts: [] });
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const searchTimeout = useRef(null);
  const globalSearchTimeout = useRef(null);
  const lastScrollY = useRef(0); // BUG-01 FIX: was null, caused wrong comparison on first scroll (0 > null)
  // Stable ref to always-fresh loadFeed — prevents stale closure in BroadcastChannel/Realtime listeners
  const loadFeedRef = useRef(null);

  // Unmount cleanup: cancel deferred timers to prevent zombie state writes
  // after component unmount (e.g., page navigation mid-undo-window or mid-search-debounce)
  useEffect(() => {
    return () => {
      if (undoDeleteRef.current) clearTimeout(undoDeleteRef.current);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (globalSearchTimeout.current) clearTimeout(globalSearchTimeout.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Article Reader Modal State
  const [articleReader, setArticleReader] = useState({ open: false, url: null, title: null });

  // Club Pages View State — hydration-safe: read URL param after mount
  const [showClubPages, setShowClubPages] = useState(false);
  // Identity context for feed filter
  const { activeIdentity, switchToPersonal, switchToClub, isClubMode, clubPage, hasClubPage, ownedPages } = useActiveIdentity();
  const [showClubPostsOnly, setShowClubPostsOnly] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'club-pages') setShowClubPages(true);
  }, []);
  const [clubPages, setClubPages] = useState([]);
  const [clubPagesLoading, setClubPagesLoading] = useState(false);
  const [clubPagesCategory, setClubPagesCategory] = useState('all');
  const [viewingClubPage, setViewingClubPage] = useState(null);
  const [clubPagesSearch, setClubPagesSearch] = useState('');
  const [clubPagesFollowing, setClubPagesFollowing] = useState(new Set());

  // Club Page Management State (Commander users)
  const [isCommander, setIsCommander] = useState(false);
  const [commanderData, setCommanderData] = useState(null);
  const [myClubPage, setMyClubPage] = useState(null);
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [showPageDashboard, setShowPageDashboard] = useState(false);
  const [myPageLoading, setMyPageLoading] = useState(false);
  const [viewingLiveGamesPage, setViewingLiveGamesPage] = useState(null);

  // ♾️ INFINITE SCROLL STATE
  const [feedOffset, setFeedOffset] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedCycle, setFeedCycle] = useState(0); // Track how many times we've looped
  const seenPostIdsRef = useRef(new Set()); // Ref instead of state — avoids re-render on every scroll
  const POSTS_PER_PAGE = 20;
  const MAX_FEED_CYCLES = 10; // Maximum loops before truly ending (shows tons of content)

  // ⚡ PERF: Cache friends/follows in refs — fetched ONCE on mount, reused on every infinite scroll page
  const friendIdsRef = useRef([]);
  const followingIdsRef = useRef([]);
  const socialGraphLoadedRef = useRef(false); // Guard against duplicate fetches

  //  GOD MODE STATE
  const [isGodMode, setIsGodMode] = useState(false);

  // Global unread message count
  const { unreadCount } = useUnreadCount();

  // LIVE STREAMING STATE
  const [liveStreams, setLiveStreams] = useState([]);
  const [watchingStream, setWatchingStream] = useState(null);
  const processedStreamIdRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false); // Scroll-to-top FAB
  const [pullRefreshState, setPullRefreshState] = useState('idle'); // 'idle' | 'pulling' | 'refreshing'
  const pullStartY = useRef(0);

  // Pull-to-refresh: touch gesture at top of page
  // BUG-01 FIX: Use ref to avoid stale closure — effect registers once on mount
  const pullRefreshStateRef = useRef(pullRefreshState);
  useEffect(() => {
    pullRefreshStateRef.current = pullRefreshState;
  }, [pullRefreshState]);
  useEffect(() => {
    let startY = 0;
    const onTouchStart = (e) => {
      if (window.scrollY < 10) startY = e.touches[0].clientY;
      else startY = 0;
    };
    const onTouchMove = (e) => {
      if (!startY || window.scrollY > 10) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 60 && pullRefreshStateRef.current === 'idle') setPullRefreshState('pulling');
    };
    const onTouchEnd = async () => {
      if (pullRefreshStateRef.current === 'pulling') {
        setPullRefreshState('refreshing');
        // BUG-02 FIX: use loadFeedRef so we always call the latest closure (not mount-time stale capture)
        try {
          await (loadFeedRef.current || loadFeed)(0, false);
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
        setPullRefreshState('idle');
      }
      startY = 0;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Realtime: auto-refresh Live Now section when any stream goes live or ends
  // BUG FIX (Bug #12): static 'social-live-monitor' name caused a zombie subscription on
  // React StrictMode double-invoke. Fixed with a unique per-mount name.
  useEffect(() => {
    const ch = supabase
      .channel(`social-live-monitor-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => {
        LiveStreamService.getLiveStreams()
          .then((streams) => setLiveStreams(streams || []))
          .catch(() => {});
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // BUG-FIX-LIVE-LIST-8b: lazy stale-stream cleanup. Every active user
  // pulling the feed sweeps any stream that's been status='live' but
  // disconnected for 60+ seconds. Auto-saves recordings (preserved as
  // drafts) rather than deleting them. Fire-and-forget — no need to
  // block feed render on this. Auth required server-side so this can't
  // be hammered anonymously.
  useEffect(() => {
    const token = typeof localStorage !== 'undefined' && localStorage.getItem('sb-access-token');
    fetch('/api/live/cleanup-stale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'same-origin',
    }).catch(() => {
      /* best-effort, don't surface */
    });
  }, []);

  //  INTRO VIDEO STATE - Video plays while page loads in background
  // Only show once per session (not on every reload)
  // SSR-safe: always start false on server, check sessionStorage on client mount
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (!sessionStorage.getItem('social-intro-seen')) {
      setShowIntro(true);
    }
  }, []);
  const introVideoRef = useRef(null);

  // BUG FIX (2026-04-30 per Dan): on iOS Safari, simply unmounting the
  // <video> element does NOT free a queued audio buffer that the browser
  // had been waiting to play. The next user gesture (e.g. tapping
  // Photo/Video) unlocks the audio context and the queued buffer plays
  // 10–20 seconds later — sounds like the intro audio "randomly" appears
  // long after the user clicked Skip. Fix: pause + mute + clear src
  // before unmount, AND track skipped state in a ref so any late-firing
  // onPlay event doesn't re-unmute.
  const introSkippedRef = useRef(false);
  const handleIntroEnd = useCallback(() => {
    introSkippedRef.current = true;
    sessionStorage.setItem('social-intro-seen', 'true');
    const v = introVideoRef.current;
    if (v) {
      try {
        v.pause();
        v.muted = true;
        v.removeAttribute('src');
        v.load(); // forces the browser to drop the buffered audio
      } catch (_) {
        /* best effort */
      }
    }
    setShowIntro(false);
  }, []);

  // Unmute video after first play event — but ONLY if the user hasn't
  // already skipped. Without this guard, a buffered onPlay event fired
  // post-skip would re-unmute and the queued audio would play.
  const handleIntroPlay = useCallback(() => {
    if (introSkippedRef.current) return;
    if (introVideoRef.current) {
      introVideoRef.current.muted = false;
    }
  }, []);

  // Bottom nav visibility - hide when scrolling down, show when scrolling up
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // Hide nav when scrolling down, show when scrolling up or at top
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setBottomNavVisible(false);
      } else {
        setBottomNavVisible(true);
      }
      // Scroll-to-top FAB: show after scrolling down 500px
      setShowScrollTop(currentScrollY > 500);
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Route prefetch — preload likely navigation targets during idle time
  useEffect(() => {
    router.prefetch('/hub/notifications');
    router.prefetch('/hub/friends');
    router.prefetch('/hub/messenger');
  }, [router]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3 REALTIME: Social Feed Subscription
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to new posts (INSERT events)
    const feedChannel = supabase
      .channel(`social-feed:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_posts',
        },
        async (payload) => {
          // Skip self-authored posts — already added optimistically in handlePost
          if (payload.new.author_id === user.id) return;
          if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
            console.log('[Social] 🔄 New post detected via realtime:', payload.new.id);
          // Trigger feed reload to pick up new posts
          broadcastSync('smarter_poker_social_sync', {
            action: 'refresh_feed',
            tabId: BROADCAST_TAB_ID,
          });
          // Also refresh local feed
          await loadFeed(0, false);
        }
      )
      .on(
        'postgres_changes',
        {
          // BUG-11 FIX: thumbnail race condition.
          // Device A receives INSERT when thumbnail_url is NULL (upload still in-flight).
          // Device B opens later and gets the row with thumbnail already set via REST.
          // Device A never re-rendered because it only subscribed to INSERT.
          // Fix: handle UPDATE events and merge changed fields (especially thumbnail_url)
          // into the local posts state so Device A sees the thumbnail without a reload.
          event: 'UPDATE',
          schema: 'public',
          table: 'social_posts',
        },
        (payload) => {
          const updatedPost = payload.new;
          if (!updatedPost?.id) return;
          setPosts((prev) =>
            prev.map((p) =>
              p.id === updatedPost.id
                ? {
                    ...p,
                    thumbnail_url: updatedPost.thumbnail_url ?? p.thumbnail_url,
                    thumbnailUrl: updatedPost.thumbnail_url ?? p.thumbnailUrl,
                    metadata: updatedPost.metadata ?? p.metadata,
                    content: updatedPost.content ?? p.content,
                  }
                : p
            )
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_likes' },
        (payload) => {
          if (payload.new && payload.new.post_id) {
            // Skip self-like events — handled optimistically in PostCard.handleLike
            if (payload.new.user_id === user.id) return;
            eventBus.emit(
              'SOCIAL_LIKE_UPDATE',
              { postId: payload.new.post_id, delta: 1 },
              'SocialRealtime'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_likes' },
        (payload) => {
          if (payload.old && payload.old.post_id) {
            // Skip self-unlike events — handled optimistically in PostCard.handleLike
            if (payload.old.user_id === user.id) return;
            eventBus.emit(
              'SOCIAL_LIKE_UPDATE',
              { postId: payload.old.post_id, delta: -1 },
              'SocialRealtime'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_comments' },
        (payload) => {
          if (payload.new && payload.new.post_id) {
            // Skip self-comment events — handled optimistically in PostCard.handleSubmitComment
            if (payload.new.author_id === user.id) return;
            eventBus.emit(
              'SOCIAL_COMMENT_UPDATE',
              {
                postId: payload.new.post_id,
                commentId: payload.new.id,
                content: payload.new.content,
                authorId: payload.new.author_id,
                parentId: payload.new.parent_id || null,
                mediaUrl: payload.new.media_url || null,
                mediaType: payload.new.media_type || null,
              },
              'SocialRealtime'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_comments' },
        (payload) => {
          if (payload.old && payload.old.post_id) {
            // Skip self-delete events — handled optimistically in PostCard
            if (payload.old.author_id === user.id) return;
            eventBus.emit(
              'SOCIAL_COMMENT_UPDATE',
              {
                postId: payload.old.post_id,
                commentId: payload.old.id,
                removed: true,
              },
              'SocialRealtime'
            );
          }
        }
      )
      .subscribe();
    const typingChannel = supabase
      .channel('social-feed')
      .on('broadcast', { event: 'typing' }, (payload) => {
        const p = payload?.payload;
        if (p) {
          eventBus.emit(
            'SOCIAL_TYPING_UPDATE',
            {
              postId: p.post_id,
              userId: p.user_id,
              name: p.name,
              avatar: p.avatar_url || null,
              isTyping: p.isTyping,
            },
            'SocialRealtime'
          );
        }
      })
      .subscribe();

    // ── Bus Listeners: cross-page + horse engine reactive hydration ──
    // (Phase 26/27/28: Horse Engine emits masterBus events when commenting/liking)
    let unsubMasterBus = [];
    if (typeof window !== 'undefined' && window.masterBus) {
      unsubMasterBus.push(
        window.masterBus.subscribe('SOCIAL_POST', () => {
          if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
            console.log('[Social] 🔄 New post detected via masterBus');
          loadFeed(0, false);
        })
      );
      unsubMasterBus.push(
        window.masterBus.subscribe('SOCIAL_LIKE', (payload) => {
          if (payload?.postId) {
            eventBus.emit(
              'SOCIAL_LIKE_UPDATE',
              { postId: payload.postId, delta: payload.delta || 1 },
              'MasterBus_Bridge'
            );
          }
        })
      );
      unsubMasterBus.push(
        window.masterBus.subscribe('SOCIAL_COMMENT', (payload) => {
          if (payload?.postId) {
            eventBus.emit('SOCIAL_COMMENT_UPDATE', { postId: payload.postId }, 'MasterBus_Bridge');
          }
        })
      );
    }

    return () => {
      supabase.removeChannel(feedChannel);
      supabase.removeChannel(typingChannel);
      unsubMasterBus.forEach((unsub) => unsub());
    };
  }, [user?.id]);

  // ═══════════════════════════════════════════════════════════════════════════
  // REALTIME: Notification subscription — live badge updates
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user?.id) return;
    const notifChannel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const n = payload.new;
          // Enrich with actor profile
          let actorProfile = null;
          const actorId =
            n.data?.commenter_id || n.data?.actor_id || n.actor_id || n.data?.sender_id;
          if (actorId) {
            try {
              const { data: prof } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .eq('id', actorId)
                .maybeSingle();
              actorProfile = prof;
            } catch {
              /* non-critical */
            }
          }
          const displayName = n.data?.actor_name || n.data?.sender_name || n.title || 'Someone';
          setNotifications((prev) => {
            // Deduplicate — skip if this notification ID is already in the list
            if (prev.some((existing) => existing.id === n.id)) return prev;
            return [
              {
                ...n,
                actor_avatar_url: actorProfile?.avatar_url || n.data?.actor_avatar || null,
                actor_name: actorProfile?.username || actorProfile?.full_name || displayName,
                actor_username: actorProfile?.username || null,
              },
              ...prev,
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [user?.id]);

  // Cross-tab Social Feed sync
  useEffect(() => {
    const cleanupSocialBc = listenBroadcast('smarter_poker_social_sync', (msg) => {
      // Support both legacy string and new object payloads
      const isRefresh = msg === 'refresh_feed' || msg?.action === 'refresh_feed';
      const isSameTab = msg?.tabId === BROADCAST_TAB_ID;
      if (isRefresh && !isSameTab) {
        if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
          console.log('[Social] Refreshing feed from other tab');
        // Use ref to get always-fresh loadFeed (avoids stale closure from mount-time capture)
        (loadFeedRef.current || loadFeed)(0, false);
      }
    });

    // Friends sync: refresh feed when friend list changes in another tab
    const cleanupFriendsBc = listenBroadcast('smarter_poker_friends_sync', (msg) => {
      // Self-tab suppression + support both string and object payloads
      if (msg?.tabId === BROADCAST_TAB_ID) return;
      if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
        console.log('[Social] Friends changed in other tab — refreshing feed');
      // BUG-10 FIX: reset graph cache so the next loadFeed re-fetches with the new friend included
      // Without this, a new friend's posts would never get the +100 priority score until page reload
      socialGraphLoadedRef.current = false;
      (loadFeedRef.current || loadFeed)(0, false);
    });

    // Block sync: when user blocks someone in another tab, hide their posts here too
    const cleanupBlockBc = listenBroadcast('smarter_poker_block_sync', (msg) => {
      if (msg?.authorId) {
        setBlockedUserIds((prev) => new Set([...prev, msg.authorId]));
      }
    });

    return () => {
      cleanupSocialBc();
      cleanupFriendsBc();
      cleanupBlockBc();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE SYNC: Update local user state when profile is edited
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let debounceTimer = null;
    // Same-tab: profile-edit.js dispatches this after saving
    const handleProfileUpdated = (e) => {
      // OPTIMISTIC: Instant UI update from event.detail (no network needed)
      const d = e?.detail;
      if (d && (d.full_name || d.avatar_url || d.username)) {
        // Re-read pref from cache (may have changed in Settings)
        let pref = 'full_name';
        try {
          const s = JSON.parse(localStorage.getItem('sp-user-settings') || '{}');
          pref = s.display_name_preference || 'full_name';
        } catch (_) {}
        const newFullName = d.full_name || null;
        const newUsername = d.username || null;
        setUser((prev) => ({
          ...prev,
          ...(newFullName !== null ? { full_name: newFullName } : {}),
          ...(newUsername !== null ? { username: newUsername } : {}),
          name:
            pref === 'username'
              ? newUsername || d.username || prev?.username || prev?.full_name
              : newFullName || d.full_name || prev?.full_name || prev?.username,
          ...(d.avatar_url ? { avatar: d.avatar_url } : {}),
        }));
      }
      // VERIFY: Debounced fetch confirms and fills remaining fields
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const authUser = getAuthUser();
          if (!authUser) return;
          const { data, error } = await supabase
            .from('profiles')
            .select('id,username,full_name,avatar_url,role')
            .eq('id', authUser.id)
            .maybeSingle();

          if (!error && data) {
            const p = data;
            let pref = 'full_name';
            try {
              const s = JSON.parse(localStorage.getItem('sp-user-settings') || '{}');
              pref = s.display_name_preference || 'full_name';
            } catch (_) {}
            const freshName =
              pref === 'username'
                ? p.username || p.full_name || null
                : p.full_name || p.username || null;
            setUser((prev) => ({
              ...prev,
              name: freshName || prev?.name,
              full_name: p.full_name || prev?.full_name,
              username: p.username || prev?.username,
              avatar: p.avatar_url || null,
            }));
            // Keep sp-social-user cache in sync after any profile save
            try {
              const cached = JSON.parse(localStorage.getItem('sp-social-user') || '{}');
              localStorage.setItem(
                'sp-social-user',
                JSON.stringify({
                  ...cached,
                  name: freshName || cached.name,
                  full_name: p.full_name || cached.full_name,
                  username: p.username || cached.username,
                  avatar: p.avatar_url || cached.avatar,
                  ts: Date.now(),
                })
              );
            } catch (_) {
              /* non-critical */
            }
          }
        } catch {
          /* non-critical */
        }
      }, 300);
    };

    window.addEventListener('profile-updated', handleProfileUpdated);

    // Cross-tab: BroadcastChannel avatar sync
    const cleanupAvatarBc = listenBroadcast('smarter_poker_avatar_sync', (msg) => {
      if (msg?.tabId === BROADCAST_TAB_ID) return; // Self-tab suppression
      handleProfileUpdated();
    });

    // Cross-tab: Settings changed (e.g. display_name_preference toggled in Settings page)
    // Immediately recompute user.name to show correct "Posting As" name without reload
    const cleanupSettingsBc = listenBroadcast('smarter_poker_settings_sync', () => {
      setUser((prev) => {
        if (!prev) return prev;
        let pref = 'full_name';
        try {
          const s = JSON.parse(localStorage.getItem('sp-user-settings') || '{}');
          pref = s.display_name_preference || 'full_name';
        } catch (_) {}
        const newName =
          pref === 'username'
            ? prev.username || prev.full_name || prev.name
            : prev.full_name || prev.username || prev.name;
        if (newName === prev.name) return prev; // no-op if unchanged
        // Also update localStorage cache
        try {
          const cached = JSON.parse(localStorage.getItem('sp-social-user') || '{}');
          localStorage.setItem(
            'sp-social-user',
            JSON.stringify({ ...cached, name: newName, ts: Date.now() })
          );
        } catch (_) {}
        return { ...prev, name: newName };
      });
    });

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('profile-updated', handleProfileUpdated);
      cleanupAvatarBc();
      cleanupSettingsBc();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // ⚡ FAST PATH: Try localStorage first (instant, no network)
        let authUser = getAuthUser();
        if (!authUser) {
          // Only fall back to ensureAuthReady if localStorage miss
          authUser = await ensureAuthReady(supabase);
        }
        if (authUser) {
          if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
            console.log('[Social] ✅ Auth hydrated:', authUser.email || authUser.id);
        } else {
          console.warn('[Social] ❌ No valid auth session found');
        }

        // ⚡ INSTANT RENDER: Hydrate from IndexedDB cache BEFORE any network calls
        // feedCache checks IndexedDB first (50MB+), falls back to localStorage (5MB)
        try {
          const cached = await feedCache.getPosts();
          if (cached?.posts?.length) {
            setPosts(cached.posts);
            setLoading(false); // Show cached posts IMMEDIATELY — network fetch happens in background
          }
          // Warm in-memory profile cache from IndexedDB (avatars, names — instant re-use)
          feedCache.warmProfileCache().catch(() => {});
        } catch {
          /* cache miss is fine */
        }

        if (authUser) {
          // Profile fetch — needed for user state before other operations
          let p = null;
          try {
            if (
              typeof window !== 'undefined' &&
              window.localStorage?.getItem('social_debug') === '1'
            )
              console.log('[Social] Fetching profile for user:', authUser.id);

            const { data, error } = await supabase
              .from('profiles')
              .select('id,username,full_name,display_name,skill_tier,avatar_url,role')
              .eq('id', authUser.id)
              .maybeSingle();

            if (!error) {
              p = data || null;
            } else {
              console.warn(
                '[Social] Profile fetch returned error',
                error.message,
                '— falling back to auth data'
              );
            }
          } catch (profileErr) {
            console.warn(
              '[Social] Profile fetch failed:',
              profileErr.message,
              '— using auth session data'
            );
          }

          // ALWAYS set user if authUser exists — profile data is enrichment, not a gate
          if (p?.role === 'god') {
            setIsGodMode(true);
          }
          // Read display_name_preference: full_name (default) or username (alias)
          let displayNamePref = 'full_name';
          try {
            const cachedSettings = JSON.parse(localStorage.getItem('sp-user-settings') || '{}');
            displayNamePref = cachedSettings.display_name_preference || 'full_name';
          } catch (_) {}
          // Also fetch from DB if not in settings cache (first-time visitors)
          if (!localStorage.getItem('sp-user-settings')) {
            try {
              const prefRes = await supabase
                .from('profiles')
                .select('display_name_preference')
                .eq('id', p?.id || authUser.id)
                .maybeSingle();
              displayNamePref = prefRes.data?.display_name_preference || 'full_name';
            } catch (_) {}
          }
          const displayName =
            displayNamePref === 'username'
              ? p?.username || p?.full_name || authUser.email?.split('@')[0] || 'Player'
              : p?.full_name || p?.username || authUser.email?.split('@')[0] || 'Player';
          setUser({
            id: p?.id || authUser.id,
            name: displayName,
            full_name: p?.full_name || null,
            username: p?.username || null,
            avatar: p?.avatar_url || null,
            tier: p?.skill_tier || null,
            role: p?.role || 'user',
            hendon: null,
          });
          // Cache DB profile to localStorage — eliminates stale alias flash on next load
          try {
            localStorage.setItem(
              'sp-social-user',
              JSON.stringify({
                id: p?.id || authUser.id,
                name: displayName,
                full_name: p?.full_name || null,
                username: p?.username || null,
                avatar: p?.avatar_url || null,
                role: p?.role || 'user',
                ts: Date.now(),
              })
            );
          } catch (_) {
            /* non-critical */
          }

          // 🕐 Update last_seen (fire-and-forget, non-blocking)
          supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', p?.id || authUser.id)
            .then(() => {
              if (
                typeof window !== 'undefined' &&
                window.localStorage?.getItem('social_debug') === '1'
              )
                console.log('[Social] Updated last_seen timestamp');
            })
            .catch((e) => {
              console.warn('[App] Handled promise rejection:', e?.message || e);
            });

          // ⚡ PARALLEL LOADING: Fire contacts, notifications, feed, and streams ALL AT ONCE
          const [, , ,] = await Promise.allSettled([
            // 1. Load contacts (non-critical)
            loadContacts(authUser.id).catch((e) => {
              console.warn('[App] Handled promise rejection:', e?.message || e);
            }),

            // 2. Load & enrich notifications
            (async () => {
              try {
                const { data: notifs, error: notifsError } = await supabase
                  .from('notifications')
                  .select('*')
                  .eq('user_id', authUser.id)
                  .order('created_at', { ascending: false })
                  .limit(50);
                if (notifsError) {
                  console.warn('[Social] Failed to load notifications:', notifsError);
                  return;
                }
                if (notifs && notifs.length > 0) {
                  const actorIds = [
                    ...new Set(
                      notifs
                        .map(
                          (n) =>
                            n.data?.commenter_id ||
                            n.data?.actor_id ||
                            n.actor_id ||
                            n.data?.sender_id
                        )
                        .filter(Boolean)
                    ),
                  ];
                  const actorNames = [
                    ...new Set(
                      notifs
                        .map((n) => {
                          const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                          return match ? match[1] : null;
                        })
                        .filter(Boolean)
                    ),
                  ];

                  // ⚡ Fetch both profile lookups in PARALLEL
                  const [profilesByIdRes, profilesByNameRes] = await Promise.all([
                    actorIds.length > 0
                      ? supabase
                          .from('profiles')
                          .select('id, username, full_name, avatar_url')
                          .in('id', actorIds)
                      : Promise.resolve({ data: [] }),
                    actorNames.length > 0
                      ? supabase
                          .from('profiles')
                          .select('id, username, full_name, avatar_url')
                          .in('full_name', actorNames)
                      : Promise.resolve({ data: [] }),
                  ]);

                  const profileById = {};
                  (profilesByIdRes.data || []).forEach((p) => {
                    profileById[p.id] = p;
                  });
                  const profileByName = {};
                  (profilesByNameRes.data || []).forEach((p) => {
                    if (p.full_name) profileByName[p.full_name.toLowerCase()] = p;
                  });

                  const enrichedNotifs = notifs.map((n) => {
                    const actorId =
                      n.data?.commenter_id || n.data?.actor_id || n.actor_id || n.data?.sender_id;
                    let profile = actorId ? profileById[actorId] : null;
                    if (!profile) {
                      const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                      const actorName = match ? match[1] : null;
                      profile = actorName ? profileByName[actorName.toLowerCase()] : null;
                    }
                    const dispName =
                      n.data?.actor_name ||
                      n.data?.sender_name ||
                      n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/)?.[1] ||
                      n.title;
                    return {
                      ...n,
                      actor_avatar_url: profile?.avatar_url || n.data?.actor_avatar || null,
                      actor_name: profile?.username || profile?.full_name || dispName,
                      actor_username: profile?.username || null,
                    };
                  });
                  setNotifications(enrichedNotifs);
                }
              } catch (e) {
                console.warn('[Social] Notification load error:', e);
              }
            })(),

            // 3. Load feed (runs its own parallel queries internally now)
            loadFeed(),

            // 4. Load live streams (non-critical)
            LiveStreamService.getLiveStreams()
              .then((streams) => setLiveStreams(streams || []))
              .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e)),
          ]);
        } else {
          if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
            console.log('[Social] No authenticated user found');
          // Still load the public feed even without auth
          await loadFeed();
        }
      } catch (e) {
        console.warn('[Social] Auth error:', e);
      }
      // Only set loading false here if cache didn't already do it
      setLoading(false);
    })();
  }, []);

  // Commander Detection & My Club Page Fetching
  useEffect(() => {
    try {
      const stored = localStorage.getItem('commander_staff');
      if (stored) {
        const data = JSON.parse(stored);
        if (data && data.venue_id) {
          setIsCommander(true);
          setCommanderData(data);
          if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
            console.log('[Social] Commander account detected:', data.venue_name);

          // Fetch if this Commander already has a club page
          setMyPageLoading(true);
          fetch(`/api/social/pages?linked_venue_id=${data.venue_id}`)
            .then((r) => r.json())
            .then((json) => {
              if (json.success && json.data && json.data.length > 0) {
                setMyClubPage(json.data[0]);
                if (
                  typeof window !== 'undefined' &&
                  window.localStorage?.getItem('social_debug') === '1'
                )
                  console.log('[Social] Found existing Club Page:', json.data[0].name);
              } else if (json.success && json.data) {
                // Also check by owner_id if no linked_venue_id match
                if (user?.id) {
                  fetch(`/api/social/pages?owner_id=${user.id}`)
                    .then((r2) => r2.json())
                    .then((json2) => {
                      if (json2.success && json2.data && json2.data.length > 0) {
                        setMyClubPage(json2.data[0]);
                      }
                    })
                    .catch((e) =>
                      console.warn('[App] Handled promise rejection:', e?.message || e)
                    );
                }
              }
            })
            .catch((e) => console.warn('[Social] Club page fetch error:', e))
            .finally(() => setMyPageLoading(false));
        }
      }
    } catch (e) {
      setMyPageLoading(false);
      console.warn('[Social] Commander detection error:', e);
    }

    // Handle ?createPage=true query param (from Commander popup redirect)
    if (router.query.createPage === 'true') {
      setShowClubPages(true);
      router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true });
      // Small delay to let state settle, then open create modal if Commander
      setTimeout(() => {
        const stored = localStorage.getItem('commander_staff');
        if (stored) setShowCreatePage(true);
      }, 500);
    }

    // Handle ?viewPage=<pageId> query param (from Commander "Edit Club Page" link)
    if (router.query.viewPage && user) {
      const pageId = router.query.viewPage;
      (async () => {
        try {
          const res = await fetch(`/api/social/pages?id=${pageId}`);
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success && json.data) {
            const pageData = Array.isArray(json.data) ? json.data[0] : json.data;
            if (pageData) {
              setMyClubPage(pageData);
              setShowClubPages(true);
              setShowPageDashboard(true);
            }
          }
        } catch (e) {
          console.warn('viewPage error:', e);
        }
        // Clean up the URL but preserve club-pages view state
        router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true });
      })();
    }

    // Handle ?ref=<referral_code> query param (from QR code scan)
    if (router.query.ref && user) {
      const refCode = router.query.ref;
      (async () => {
        try {
          // Look up the page by referral code
          const res = await fetch(`/api/social/pages/qrcode?ref=${refCode}`);
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success && json.data) {
            const refPage = json.data;
            const token = getAccessToken();
            // Auto-follow the page
            await fetch('/api/social/pages/follow', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ page_id: refPage.id, user_id: user.id, action: 'follow' }),
            });
            // Show the club pages view and navigate to the referred page's live games
            setShowClubPages(true);
            setViewingLiveGamesPage(refPage);
            // Clean up the URL but preserve club-pages view state
            router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true });
          }
        } catch (e) {
          console.warn('Referral follow error:', e);
        }
      })();
    }
    // Handle ?stream=<streamId> query param (from go-live notifications)
    if (router.query.stream && user) {
      const streamId = router.query.stream;
      if (processedStreamIdRef.current !== streamId) {
        processedStreamIdRef.current = streamId;
        (async () => {
          try {
            const streamData = await LiveStreamService.getStream(streamId);
            if (streamData && streamData.status === 'live') {
              setWatchingStream(streamData);
            } else if (streamData && streamData.status === 'ended') {
              toast.info('This stream has ended');
            } else if (!streamData) {
              toast.info('This stream is no longer available');
            }
          } catch (e) {
            console.warn('[stream param] failed:', e);
          }
          router.replace('/hub/social-media', undefined, { shallow: true });
        })();
      }
    }
  }, [user, router.query.createPage, router.query.ref, router.query.viewPage, router.query.stream]);

  //  REFRESH NOTIFICATIONS when modal opens — always show latest data
  useEffect(() => {
    if (!showNotifications || !user) return;
    (async () => {
      try {
        const { data: notifs, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) {
          console.warn('[Social] Notification refresh error:', error);
          return;
        }
        if (!notifs || notifs.length === 0) {
          setNotifications([]);
          return;
        }

        // Enrich with actor profiles
        const actorIds = [
          ...new Set(
            notifs
              .map(
                (n) => n.data?.commenter_id || n.data?.actor_id || n.actor_id || n.data?.sender_id
              )
              .filter(Boolean)
          ),
        ];
        let profileById = {};
        if (actorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', actorIds);
          (profiles || []).forEach((p) => {
            profileById[p.id] = p;
          });
        }
        const enriched = notifs.map((n) => {
          const actorId =
            n.data?.commenter_id || n.data?.actor_id || n.actor_id || n.data?.sender_id;
          const profile = actorId ? profileById[actorId] : null;
          const displayName =
            n.data?.actor_name ||
            n.data?.sender_name ||
            n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/)?.[1] ||
            n.title;
          return {
            ...n,
            actor_avatar_url: profile?.avatar_url || n.data?.actor_avatar || null,
            actor_name: profile?.username || profile?.full_name || displayName,
            actor_username: profile?.username || null,
          };
        });
        setNotifications(enriched);
      } catch (e) {
        console.warn('[Social] Notification refresh failed:', e);
      }
    })();
  }, [showNotifications, user]);

  //  AUTO-MARK NOTIFICATIONS AS READ when dropdown opens
  // BUG-04 FIX: Guard against unnecessary re-fires when notifications arrive while dropdown is open
  const markReadFiredRef = useRef(false);
  useEffect(() => {
    // Reset the guard when dropdown closes
    if (!showNotifications) {
      markReadFiredRef.current = false;
      return;
    }
    if (!user || notifications.length === 0) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return; // Nothing to mark — skip entirely
    if (markReadFiredRef.current) return; // Already fired this open cycle
    markReadFiredRef.current = true;
    // BUG-25 FIX: Was marking read directly via Supabase client (bypassed server cache).
    // Now uses mark-read API so server-side feed cache is invalidated on write.
    (async () => {
      try {
        let accessToken = null;
        try {
          const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
          accessToken = authData?.access_token || null;
        } catch (_) {}
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ ids: unreadIds }),
        });
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch (e) {
        console.warn('[Social] Notification mark-read failed:', e);
      }
      // Update localStorage badge count so header reflects cleared state
      try {
        localStorage.setItem('sp-notif-count', '0');
      } catch (_) {}
      // Sync: tell other tabs + header to update badge count
      broadcastSync('smarter_poker_notif_sync', 'refresh_notifications');
      eventBus.emit(
        EventType.NOTIFICATIONS_READ,
        { count: unreadIds.length },
        'SocialNotifDropdown'
      );
      busEmit.dataMutated('notifications');
    })();
  }, [showNotifications, notifications.length, user]);

  const loadFeed = async (offset = 0, append = false) => {
    // Always keep ref up-to-date so BroadcastChannel listeners get the fresh closure
    loadFeedRef.current = loadFeed;
    try {
      // BUG-03 FIX: on a full refresh (not append), reset offset state + clear seen-post cache
      // Without this: loadMorePosts() uses stale feedOffsetRef, and old posts get -30 penalty score on re-render
      if (!append) {
        setFeedOffset(0);
        seenPostIdsRef.current = new Set();
      }
      if (append) setLoadingMore(true);

      // Read user ID from localStorage (avoids getSession AbortError)
      let authUserId = null;
      try {
        const explicitAuth = localStorage.getItem('smarter-poker-auth');
        if (explicitAuth) {
          authUserId = JSON.parse(explicitAuth)?.user?.id || null;
        }
        if (!authUserId) {
          const sbKeys = Object.keys(localStorage || {}).filter(
            (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
          );
          if (sbKeys.length > 0) {
            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
            authUserId = tokenData?.user?.id || null;
          }
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ⚡ PERF: Fetch social graph ONCE, cache in refs for all subsequent scroll pages
      let friendIds = friendIdsRef.current;
      let followingIds = followingIdsRef.current;

      if (authUserId && !socialGraphLoadedRef.current) {
        socialGraphLoadedRef.current = true;
        try {
          const [{ data: friendships }, { data: follows }] = await Promise.all([
            supabase
              .from('friendships')
              .select('user_id, friend_id')
              .or(`user_id.eq.${authUserId},friend_id.eq.${authUserId}`)
              .eq('status', 'accepted'),
            supabase.from('social_follows').select('following_id').eq('follower_id', authUserId),
          ]);
          if (friendships)
            friendIds = [
              ...new Set(
                friendships.map((f) => (f.user_id === authUserId ? f.friend_id : f.user_id))
              ),
            ];
          if (follows) followingIds = follows.map((f) => f.following_id);
          friendIdsRef.current = friendIds;
          followingIdsRef.current = followingIds;
        } catch (e) {
          socialGraphLoadedRef.current = false;
          console.warn('[Social] Social graph fetch failed:', e);
        }
      }

      const prioritySet = new Set([...friendIds, ...followingIds]);

      // ─────────────────────────────────────────────────────────────────────
      // ⚡ UNIFIED API CALL: 1 round trip = posts + author profiles + bookmarks
      //    Previously: 3 sequential client→Supabase fetches (~240ms+)
      //    Now: 1 server-side Next.js API call with service role key (~60-80ms)
      // ─────────────────────────────────────────────────────────────────────
      const apiUrl = `/api/social/feed?offset=${offset}&limit=${POSTS_PER_PAGE}${authUserId ? `&user_id=${authUserId}` : ''}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Feed API error: ${response.status}`);
      }

      const { posts: rawPosts, hasMore } = await response.json();

      // Pagination state
      if (!rawPosts || rawPosts.length === 0) {
        if (feedCycle < MAX_FEED_CYCLES) {
          setFeedCycle((prev) => prev + 1);
          setFeedOffset(0);
        } else {
          setHasMorePosts(false);
        }
      } else {
        setHasMorePosts(hasMore !== false);
      }

      if (!rawPosts?.length) return;

      // ── Client-side ranking (uses cached social graph — zero extra fetches) ──
      const now = Date.now();
      const calculatePostScore = (post) => {
        let score = 0;
        if (friendIds.includes(post.authorId)) score += 100;
        else if (followingIds.includes(post.authorId)) score += 50;
        score += Math.min((post.likeCount || 0) * 2, 30);
        score += Math.min((post.commentCount || 0) * 3, 30);
        score += Math.min((post.shareCount || 0) * 4, 20);
        const ageHours = (now - new Date(post.createdAt).getTime()) / 3600000;
        if (ageHours < 6) score += 50;
        else if (ageHours < 24) score += 40;
        else if (ageHours < 72) score += 20;
        score -= Math.min((ageHours / 24) * 2, 20);
        if (seenPostIdsRef.current.has(post.id)) score -= 30;
        score += Math.random() * 30 - 15;
        return score;
      };

      // Enrich + rank (API already returns profiles & likes embedded)
      const formattedPosts = rawPosts.map((p) => ({
        ...p,
        timeAgo: timeAgo(p.createdAt),
        isPriority: prioritySet.has(p.authorId),
        isSuggested: feedCycle > 0,
        isFriend: friendIds.includes(p.authorId),
        isFollowing: followingIds.includes(p.authorId),
        score: calculatePostScore(p),
      }));

      formattedPosts.sort((a, b) => b.score - a.score);

      // Track seen post IDs (ref = no re-render)
      formattedPosts.forEach((p) => seenPostIdsRef.current.add(p.id));

      // Cache author profiles in IndexedDB for instant avatar render next visit
      const profileMap = {};
      formattedPosts.forEach((p) => {
        if (p.authorId && p.author) profileMap[p.authorId] = p.author;
      });
      if (Object.keys(profileMap).length > 0) feedCache.setProfiles(profileMap);

      if (append) {
        setPosts((prev) => [...prev, ...formattedPosts]);
      } else {
        setPosts(formattedPosts);
        // Persist to IndexedDB (50MB+) and localStorage fallback
        feedCache.setPosts(formattedPosts);
      }
    } catch (e) {
      console.warn('[Social] Feed error:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // ♾️ INFINITE SCROLL: Refs to avoid stale closures in IntersectionObserver
  const feedOffsetRef = useRef(feedOffset);
  const hasMorePostsRef = useRef(hasMorePosts);
  const loadingMoreRef = useRef(loadingMore);

  // Keep refs in sync with state
  useEffect(() => {
    feedOffsetRef.current = feedOffset;
  }, [feedOffset]);
  useEffect(() => {
    hasMorePostsRef.current = hasMorePosts;
  }, [hasMorePosts]);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  // ♾️ INFINITE SCROLL: Load more posts when scrolling
  const loadMorePosts = async () => {
    if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
      console.log(
        '[Social] loadMorePosts called, loadingMore:',
        loadingMoreRef.current,
        'hasMorePosts:',
        hasMorePostsRef.current
      );
    if (loadingMoreRef.current || !hasMorePostsRef.current) return;
    const newOffset = feedOffsetRef.current + POSTS_PER_PAGE;
    if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
      console.log('[Social] Loading more from offset:', newOffset);
    setFeedOffset(newOffset);
    await loadFeed(newOffset, true);
  };

  // ♾️ INFINITE SCROLL: Store observer in ref to avoid recreating
  const observerRef = useRef(null);

  // ♾️ INFINITE SCROLL: Callback ref that attaches observer immediately when element mounts
  const loadMoreCallbackRef = useCallback((node) => {
    // Cleanup previous observer if any
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // If node is null (unmounting), we're done
    if (!node) {
      if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
        console.log('[Social] Sentinel unmounted, observer disconnected');
      return;
    }

    if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
      console.log('[Social] ✅ Sentinel mounted! Attaching IntersectionObserver...');

    // Create and attach new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
            console.log('[Social] Sentinel visible! Calling loadMorePosts...');
          loadMorePosts();
        }
      },
      { threshold: 0.1, rootMargin: '600px' } // Pre-fetch 600px before bottom — feels instant
    );

    observerRef.current.observe(node);
  }, []); // Empty deps - uses refs for current values

  const handlePost = async (
    content,
    urls,
    type,
    mentions = [],
    linkPreview = null,
    visibility = 'public',
    thumbnailUrl = null
  ) => {
    if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
      console.log('[Social]  handlePost called with:', {
        content: content?.substring(0, 50),
        urls,
        type,
        mentions,
        hasLinkPreview: !!linkPreview,
      });
    if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
      console.log('[Social]  linkPreview FULL OBJECT:', JSON.stringify(linkPreview, null, 2));
    if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
      console.log('[Social]  User state:', { id: user?.id, name: user?.name, hasUser: !!user });

    if (!user?.id) {
      console.warn('[Social] ❌ Cannot post: user.id is missing!', user);
      return false;
    }

    setIsPosting(true);

    // Check if posting as Club Page
    let identityStoredRaw = null;
    try {
      identityStoredRaw = localStorage.getItem('active-identity');
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
    let identityStored = null;
    try {
      identityStored = identityStoredRaw ? JSON.parse(identityStoredRaw) : null;
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
    const isClubPost = identityStored?.mode === 'club' && identityStored?.clubPage?.id;

    try {
      if (isClubPost) {
        // ═══ CLUB PAGE POST — route through page posts API ═══
        const clubPageId = identityStored.clubPage.id;
        if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
          console.log(
            '[Social] 🏢 Posting as Club Page:',
            identityStored.clubPage.name,
            clubPageId
          );

        const token = getAccessToken();
        const res = await fetch('/api/social/pages/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            page_id: clubPageId,
            author_id: user.id,
            content,
            content_type: type,
            media_urls: urls,
            visibility: visibility || 'public',
            // AUDIT-4 FIX (2026-04-30): include thumbnail_url. The
            // club-page path optimistically rendered the thumbnail
            // in the feed (line 5232) but NEVER persisted it via
            // the API. /api/social/pages/posts already destructures
            // and writes thumbnail_url, so the field was silently
            // dropped on the client side. Result: every club-page
            // video saved with thumbnail_url=null and the next
            // page load showed a black box until the video decoded.
            ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
            ...(linkPreview
              ? {
                  link_preview: {
                    url: linkPreview.url || urls[0],
                    title: linkPreview.title || null,
                    description: linkPreview.description || null,
                    image: linkPreview.image || null,
                  },
                }
              : {}),
          }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to post as club');

        if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
          console.log('[Social] ✅ Club page post created:', json.data?.id);

        // Add to feed with club identity
        setPosts((prev) => [
          {
            id: json.data?.id || Date.now(),
            authorId: user.id,
            content,
            contentType: type,
            mediaUrls: urls,
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
            // RACE FIX (2026-04-29): propagate thumbnail_url so the
            // freshly-posted video shows a thumbnail immediately
            thumbnailUrl: thumbnailUrl || null,
            thumbnail_url: thumbnailUrl || null,
            reactions: [],
            timeAgo: 'Just now',
            isLiked: false,
            isBookmarked: false,
            justPosted: true,
            // Link metadata for ArticleCard rendering
            link_url: linkPreview?.url || null,
            link_title: linkPreview?.title || null,
            link_description: linkPreview?.description || null,
            link_image: linkPreview?.image || null,
            link_site_name: linkPreview?.domain || null,
            author: {
              name: identityStored.clubPage.name,
              username: null,
              avatar: identityStored.clubPage.avatar_url,
            },
            isClubPagePost: true,
            clubPageId: clubPageId,
          },
          ...prev,
        ]);

        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast.success(`Posted as ${identityStored.clubPage.name}!`, 2000);
        busEmit.dataMutated('social');
        busEmit.socialPostCreated(json.data?.id, user.id);
        broadcastSync('smarter_poker_social_sync', {
          action: 'refresh_feed',
          tabId: BROADCAST_TAB_ID,
        });
        return true;
      }

      // ═══ PERSONAL POST — use fn_create_social_post RPC (supports thumbnail_url, achievement_data) ═══
      // Build link metadata for achievement_data field
      let achievementData = null;
      if (linkPreview) {
        if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
          console.log('[Social]  Adding link metadata from preview:', linkPreview);
        achievementData = JSON.stringify({
          link_url: linkPreview.url || urls[0],
          link_title: linkPreview.title || null,
          link_description: linkPreview.description || null,
          link_image: linkPreview.image || null,
          link_site_name: linkPreview.domain || null,
        });
      }

      if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
        console.log('[Social]  Calling fn_create_social_post with:', {
          content: content?.substring(0, 50),
          type,
          urlCount: urls.length,
          hasThumbnail: !!thumbnailUrl,
        });

      // AUDIT-15 (2026-04-30 per Dan: "JUST GIVE ME THE FUCKING ABILITY
      // TO POST VIDEOS"): The most common cause of 'Unable to post at
      // this time' on mobile after a long upload is JWT expiration.
      // Video upload can take 30s-3min. During that window the
      // Supabase JS SDK auto-refresh may not run if the tab was
      // backgrounded (iOS aggressively suspends background timers).
      // Result: by the time we call fn_create_social_post, the
      // session is expired → role='anon' → RPC returns 'forbidden:
      // anonymous callers cannot create posts' → fallback INSERT
      // also fails RLS → user sees generic 'Unable to post' banner.
      //
      // Fix: ensure the session is fresh BEFORE the post-create call.
      // getSession() auto-refreshes if the token is within 60s of
      // expiry. If refresh fails (e.g., refresh token revoked),
      // surface a clear 'session expired, please log in again' message
      // instead of the cryptic generic banner.
      // AUDIT-17: timeout-guarded session refresh. Bare getSession()
      // can hang forever on iPhone Safari if a stale tab is holding
      // the navigator.locks lock. Race against a 4s timer; if the
      // SDK doesn't respond, fall through to localStorage-only check
      // (same approach bgUpload._ensureBearer takes for the same
      // reason). Never hang the post on an SDK lock.
      try {
        const _withTimeout = (p, ms, label) =>
          Promise.race([
            p,
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
            ),
          ]);
        // AUDIT-18: a JWT in localStorage may be shape-valid but
        // expired — accepting it leads fn_create_social_post to
        // see role='anon' and return 'forbidden'. Validate exp
        // claim (same pattern as bgUpload._isFreshJWT) so the
        // localStorage fast-path only applies when the token is
        // genuinely fresh; otherwise fall through to refreshSession.
        const _isFreshJwt = (tok) => {
          if (typeof tok !== 'string') return false;
          const parts = tok.split('.');
          if (parts.length !== 3) return false;
          try {
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
            const json =
              typeof atob === 'function'
                ? atob(b64 + pad)
                : Buffer.from(b64 + pad, 'base64').toString('utf-8');
            const payload = JSON.parse(json);
            if (typeof payload.exp !== 'number') return false;
            return payload.exp > Math.floor(Date.now() / 1000) + 30; // 30s skew
          } catch (_) {
            return false;
          }
        };
        let sessionOk = false;
        try {
          const { data } = await _withTimeout(supabase.auth['getSession'](), 4000, 'getSession');
          sessionOk = _isFreshJwt(data?.session?.access_token);
        } catch (lockErr) {
          console.warn('[Social] getSession timed out:', lockErr?.message);
        }
        if (!sessionOk) {
          try {
            const raw = localStorage.getItem('smarter-poker-auth');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (_isFreshJwt(parsed?.access_token)) sessionOk = true;
            }
          } catch (_) {}
        }
        if (!sessionOk) {
          try {
            const { data: refreshed } = await _withTimeout(
              supabase.auth['refreshSession'](),
              4000,
              'refreshSession'
            );
            if (_isFreshJwt(refreshed?.session?.access_token)) sessionOk = true;
          } catch (refreshErr) {
            console.warn('[Social] refreshSession timed out:', refreshErr?.message);
          }
        }
        if (!sessionOk) {
          throw new Error('Your session has expired. Please refresh the page or log in again.');
        }
      } catch (sessionErr) {
        // If we genuinely can't recover a session, fail fast with the clear msg.
        // (Lock timeouts above are caught and don't bubble — only an explicit
        // 'session expired' throw lands here.)
        throw new Error(sessionErr?.message || 'Your session has expired. Please log in again.');
      }

      // Try RPC first (supports thumbnail_url + avoids RLS ambiguity triggers)
      let data = null;
      let error = null;
      const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_create_social_post', {
        p_author_id: user.id,
        p_content: content || '',
        p_content_type: type,
        p_media_urls: urls,
        p_visibility: visibility || 'public',
        p_achievement_data: achievementData,
        p_thumbnail_url: thumbnailUrl || null,
      });

      if (!rpcError && rpcResult?.success) {
        data = rpcResult; // { success: true, id: uuid }
      } else {
        // AUDIT-15: previously only logged rpcError.message, ignoring
        // the structured error in rpcResult.error (e.g., 'forbidden:
        // authenticated users may only post as themselves'). Now we
        // capture both so the eventual throw carries the real reason.
        const rpcReason = rpcError?.message || rpcResult?.error || 'unknown RPC failure';
        console.warn('[Social] ⚠️ RPC failed, falling back to direct insert:', rpcReason);
        // Fallback: direct insert (legacy path — no thumbnail_url support)
        const insertPayload = {
          author_id: user.id,
          content,
          content_type: type,
          media_urls: urls,
          visibility: visibility || 'public',
          thumbnail_url: thumbnailUrl || null,
        };
        // Carry link metadata in dedicated columns when RPC is unavailable
        if (linkPreview) {
          insertPayload.link_url = linkPreview.url || urls[0];
          insertPayload.link_title = linkPreview.title || null;
          insertPayload.link_description = linkPreview.description || null;
          insertPayload.link_image = linkPreview.image || null;
          insertPayload.link_site_name = linkPreview.domain || null;
        }
        const { data: directData, error: directError } = await supabase
          .from('social_posts')
          .insert(insertPayload)
          .select('id')
          .maybeSingle();
        data = directData;
        // If direct insert ALSO failed, the surfaced error mentions
        // both reasons so Dan can see what really blocked the write.
        if (directError) {
          error = new Error(`Post failed (RPC: ${rpcReason}; direct: ${directError.message})`);
        } else if (!directData?.id) {
          error = new Error(`Post failed: ${rpcReason}`);
        }
      }

      if (error || !data?.id) {
        console.warn(
          '[Social] ❌ Post creation error:',
          error?.message,
          error?.details,
          error?.hint,
          error?.code
        );
        throw error || new Error('Post creation returned no data');
      }

      if (typeof window !== 'undefined' && window.localStorage?.getItem('social_debug') === '1')
        console.log('[Social] ✅ Post created successfully:', data.id);

      // ═══ PRIMARY SUCCESS: Add to feed IMMEDIATELY ═══
      // This must happen before ANY secondary operations (mentions, reels)
      // so that failures in those don't prevent the post from appearing.
      //
      // PHASE-A (2026-05-03): the RPC now returns a hydrated payload
      // (id, author_id, content, content_type, created_at, media_urls,
      // thumbnail_url, like_count, comment_count). Use it directly when
      // available so the optimistic card matches what the realtime sub
      // will deliver moments later — eliminates the brief flicker where
      // the card's timestamp jumps from "Just now" to the real time and
      // counts re-zero. When falling through to direct INSERT (which
      // returns only `id`), we still construct from local state.
      const hydrated = rpcResult && rpcResult.success ? rpcResult : null;
      setPosts((prev) => [
        {
          id: data.id,
          authorId: user.id,
          content,
          contentType: type,
          mediaUrls: urls,
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          // Use the RPC's NOW() timestamp when available so the realtime
          // INSERT event from the same row doesn't reorder the feed.
          created_at: hydrated?.created_at || new Date().toISOString(),
          createdAt: hydrated?.created_at || new Date().toISOString(),
          // Mirror DB shape for code paths that key off snake_case.
          author_id: user.id,
          content_type: type,
          media_urls: urls,
          like_count: hydrated?.like_count ?? 0,
          comment_count: hydrated?.comment_count ?? 0,
          // RACE FIX (2026-04-29): include thumbnailUrl in BOTH camelCase and
          // snake_case so the SmarterPokerStyleCard's `post.thumbnail_url`
          // lookup hits on the just-posted video. Without this, the freshly
          // posted video shows as a black box with a play button until the
          // feed reloads from /api/social/feed.
          thumbnailUrl: thumbnailUrl || null,
          thumbnail_url: thumbnailUrl || null,
          reactions: [],
          timeAgo: 'Just now',
          isLiked: false,
          isBookmarked: false,
          justPosted: true, // Mark as just posted for highlight
          // Link metadata for ArticleCard rendering (parity with club page posts + loadFeed)
          link_url: linkPreview?.url || null,
          link_title: linkPreview?.title || null,
          link_description: linkPreview?.description || null,
          link_image: linkPreview?.image || null,
          link_site_name: linkPreview?.domain || null,
          author: { name: user.name, username: user.username, avatar: user.avatar },
        },
        ...prev,
      ]);

      // Scroll to top of feed so user sees their new post immediately (SmarterPoker behavior)
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Show success toast + audio chirp (Dan request 2026-04-29)
      // Lightweight WebAudio "ding" — no asset dependency, no preload step.
      try {
        if (typeof window !== 'undefined' && window.AudioContext) {
          const ac = new (window.AudioContext || window.webkitAudioContext)();
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.connect(g);
          g.connect(ac.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(880, ac.currentTime); // A5
          o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.12); // E6 — bright "chirp up"
          g.gain.setValueAtTime(0.0001, ac.currentTime);
          g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
          o.start();
          o.stop(ac.currentTime + 0.2);
          setTimeout(() => {
            try {
              ac.close();
            } catch (_) {}
          }, 400);
        }
      } catch (_) {
        /* audio is a nice-to-have, never block the post */
      }
      toast.success('Posted Successfully!', 2000);
      busEmit.dataMutated('social');
      busEmit.socialPostCreated(data.id, user.id);
      broadcastSync('smarter_poker_social_sync', {
        action: 'refresh_feed',
        tabId: BROADCAST_TAB_ID,
      });

      // ═══ SECONDARY OPERATIONS (isolated — failure must NOT affect post UX) ═══
      try {
        // Insert mentions if any
        if (mentions.length > 0 && data?.id) {
          // Look up user IDs for mentioned usernames
          const { data: mentionedUsers } = await supabase
            .from('profiles')
            .select('id, username')
            .in('username', mentions);

          if (mentionedUsers?.length > 0) {
            const mentionInserts = mentionedUsers.map((u) => ({
              post_id: data.id,
              mentioned_user_id: u.id,
              mentioned_by_id: user.id,
            }));
            await supabase.from('mentions').insert(mentionInserts);
          }
        }

        // AUTO-SAVE VIDEOS TO REELS
        // When a video is posted, automatically create a Reel entry
        if (type === 'video' && urls.length > 0) {
          const videoUrl =
            urls.find(
              (url) =>
                url.includes('.mp4') ||
                url.includes('.webm') ||
                url.includes('.mov') ||
                url.includes('video') ||
                !url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
            ) || urls[0];

          await supabase.from('social_reels').insert({
            author_id: user.id,
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl || null,
            caption: content || null,
            source_post_id: data.id,
            is_public: true,
            view_count: 0,
            like_count: 0,
          });
        }
      } catch (secondaryErr) {
        console.warn('[App] Handled exception:', secondaryErr?.message || secondaryErr);
      }

      return true;
    } catch (e) {
      // AUDIT-14 (2026-04-30 per Dan: "Unable to post at this time" with
      // no further detail). The previous catch swallowed the actual
      // error message and returned false → SharedPostCreator showed the
      // generic 'Unable to post at this time. Please try again later.'
      // banner with no clue what actually broke. Surface the real error
      // via toast.error AND console.error so Dan can read what failed
      // on the next attempt. Most common causes:
      //   • RLS denied on fn_create_social_post (auth.uid() check fails)
      //   • Direct insert RLS denied
      //   • Token expired between upload and post
      //   • Network failure mid-RPC
      const msg = e?.message || e?.error_description || String(e) || 'unknown';
      console.error('[Social] Post error:', e);
      try {
        toast.error(`Post failed: ${String(msg).slice(0, 200)}`, 8000);
      } catch (_) {}
      return false;
    } finally {
      setIsPosting(false);
    }
  };

  const handleLike = async (postId, type) => {
    if (!user?.id) return;
    try {
      if (!type) {
        // Unlike: remove from social_likes
        // DB trigger (trig_sync_like_count) handles like_count decrement atomically — no RPC needed
        const { error } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
        if (error) throw new Error(error.message);

        // Notify other views/tabs of unlike
        busEmit.socialPostLiked(postId, user.id, { added: false, reactionType: null });
      } else {
        // Like: write to social_likes with reaction_type
        // DB trigger (trig_sync_like_count) handles like_count increment atomically — no RPC needed
        const { data: existing } = await supabase
          .from('social_likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existing) {
          const { error } = await supabase.from('social_likes').insert({
            post_id: postId,
            user_id: user.id,
            reaction_type: type || 'like',
          });
          if (error) throw new Error(error.message);

          // Notify other views/tabs of new like
          busEmit.socialPostLiked(postId, user.id, { added: true, reactionType: type || 'like' });
        } else {
          // Change reaction type on existing like (no count change — no INSERT/DELETE, no trigger)
          await supabase
            .from('social_likes')
            .update({ reaction_type: type || 'like' })
            .eq('id', existing.id);

          // Notify other views/tabs of reaction swap (added:null = no count change)
          busEmit.socialPostLiked(postId, user.id, { added: null, reactionType: type || 'like' });
        }
      }
    } catch (e) {
      console.warn('[Social] handleLike error:', e.message);
      throw e; // Re-throw so PostCard can revert optimistic UI
    }
  };

  const handleDelete = async (id) => {
    if (!user?.id) return;
    setDeletePostId(id);
  };

  const confirmDeletePost = async () => {
    const id = deletePostId;
    if (!id) return;
    setDeletePostId(null);

    // Phase 2: Undo-delete — optimistically remove from UI, delay actual API call 5s
    const deletedPost = posts.find((p) => p.id === id);
    const deletedIndex = posts.findIndex((p) => p.id === id);
    setPosts((prev) => prev.filter((p) => p.id !== id));

    // Clear any existing undo timer
    if (undoDeleteRef.current) clearTimeout(undoDeleteRef.current);

    // Show undo toast
    toast.success('Post deleted', 5000);

    // Schedule actual deletion after 5s
    undoDeleteRef.current = setTimeout(async () => {
      undoDeleteRef.current = null;
      try {
        const token = getAccessToken();
        if (!token) {
          console.warn('[Delete] No auth token');
          return;
        }
        const response = await fetch('/api/posts/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ postId: id }),
        });
        const result = await response.json();
        if (!response.ok || result.error) {
          console.warn('[Delete] Server error:', result);
          // Restore on API failure
          if (deletedPost) {
            setPosts((prev) => {
              const updated = [...prev];
              updated.splice(Math.min(deletedIndex, updated.length), 0, deletedPost);
              return updated;
            });
          }
          toast.error(result.error || 'Failed to delete post');
          return;
        }
        try {
          localStorage.removeItem('sp-feed-cache');
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
        busEmit.dataMutated('social');
      } catch (e) {
        console.warn('[Delete] Error:', e);
        if (deletedPost) {
          setPosts((prev) => {
            const updated = [...prev];
            updated.splice(Math.min(deletedIndex, updated.length), 0, deletedPost);
            return updated;
          });
        }
        toast.error('Error deleting post');
      }
    }, 5000);

    // Expose undo: clicking anywhere before 5s restores the post
    // Post is removed from UI immediately. If the 5s timer completes, it's permanently deleted.
    // If they want to undo, they can re-navigate or refresh before 5s
  };

  const loadContacts = async (userId) => {
    try {
      // Step 1: Fetch all conversations the user is in (single query)
      const { data: myConvos } = await supabase
        .from('social_conversation_participants')
        .select('conversation_id, social_conversations(last_message_preview)')
        .eq('user_id', userId);
      if (!myConvos || myConvos.length === 0) return;

      // Step 2: Fetch ALL participants for those conversations in one query
      const conversationIds = myConvos.map((c) => c.conversation_id);
      const { data: allParts } = await supabase
        .from('social_conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', conversationIds)
        .neq('user_id', userId);
      if (!allParts || allParts.length === 0) return;

      // Build a map: conversation_id -> other user_id
      const convToUser = {};
      for (const p of allParts) {
        if (!convToUser[p.conversation_id]) convToUser[p.conversation_id] = p.user_id;
      }

      // Step 3: Batch-fetch all profiles in one query
      const uniqueUserIds = [...new Set(Object.values(convToUser || {}))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', uniqueUserIds);
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

      // Assemble contacts in-memory
      const list = myConvos.map((c) => {
        const otherUserId = convToUser[c.conversation_id];
        if (!otherUserId) return null;
        const prof = profileMap[otherUserId];
        return {
          id: otherUserId,
          name: prof?.username || 'Player',
          avatar: null,
          conversationId: c.conversation_id,
          lastMessage: c.social_conversations?.last_message_preview,
          online: false,
        };
      });
      setContacts(list.filter(Boolean));
    } catch (e) {
      console.warn(e);
    }
  };

  const handleSearch = (q) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, username')
          .ilike('username', `%${q}%`)
          .limit(10);
        if (data) setSearchResults(data.map((u) => ({ id: u.id, username: u.username })));
      } catch (e) {
        console.warn(e);
      }
    }, 300);
  };

  // Global search for users and posts
  const handleGlobalSearch = (query) => {
    setGlobalSearchQuery(query);
    if (globalSearchTimeout.current) clearTimeout(globalSearchTimeout.current);
    if (query.length < 2) {
      setGlobalSearchResults({ users: [], posts: [] });
      return;
    }
    setGlobalSearchLoading(true);
    globalSearchTimeout.current = setTimeout(async () => {
      try {
        // Search users (search both username and full_name)
        const { data: users } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
          .limit(8);

        // Search posts
        const { data: posts } = await supabase
          .from('social_posts')
          .select('id, content, author_id, created_at')
          .ilike('content', `%${query}%`)
          .limit(5);

        // Get author info for posts
        let enrichedPosts = [];
        if (posts?.length) {
          const authorIds = [...new Set(posts.map((p) => p.author_id))];
          const { data: authors } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', authorIds);
          const authorMap = Object.fromEntries((authors || []).map((a) => [a.id, a]));
          enrichedPosts = posts.map((p) => ({
            ...p,
            author: authorMap[p.author_id],
          }));
        }

        setGlobalSearchResults({
          users: users || [],
          posts: enrichedPosts,
        });
      } catch (e) {
        console.warn('Global search error:', e);
      }
      setGlobalSearchLoading(false);
    }, 300);
  };

  const handleOpenChat = (c) => {
    if (!c) return;
    // Deep-link to the unified messenger with compose mode — no local chat dock
    const targetUsername = c.username || c.name || c.id;
    if (targetUsername && c.id) {
      router.push(`/hub/messenger?compose=${encodeURIComponent(targetUsername)}&uid=${c.id}`);
    }
  };

  // 📡 Supabase Realtime: Forward incoming messages to the global EventBus
  // (Messenger page handles all rendering — this just keeps unread counts fresh)
  //
  // NOTE: previous version filtered by `receiver_id=eq.${user.id}`, but
  // social_messages has NO receiver_id column (schema is conversation-based:
  // sender_id + conversation_id only). That bogus filter caused Postgres
  // realtime to emit "invalid column for filter receiver_id" errors at
  // ~4/min in prod logs and the subscription never fired any events.
  // Membership gating is handled inside the handler via sender_id check
  // and downstream by Messenger page (it knows which conversations belong
  // to the user). A proper RLS-bound realtime filter is a future
  // optimization; for now subscribing to all INSERTs and filtering in JS
  // is the correct shape given the conversation-based schema.
  const openChatsRef = useRef([]);
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`social-media-realtime-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_messages' },
        (payload) => {
          const newMsg = payload.new;
          if (!newMsg) return;
          const convId = newMsg.conversation_id;
          if (newMsg.sender_id !== user.id) {
            // Fire global event bus so unread badges update
            eventBus.emit(
              EventType.MESSAGE_RECEIVED,
              { conversationId: convId, senderId: newMsg.sender_id },
              'SocialMedia'
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Only show loading skeleton if intro is done and still loading
  if (loading && !showIntro)
    return (
      <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 70 }}>
        <style>{`
                @keyframes sf-shimmer {
                    0%   { background-position: -800px 0; }
                    100% { background-position: 800px 0; }
                }
                .sf-skel {
                    background-image: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%);
                    background-size: 800px 100%;
                    animation: sf-shimmer 1.4s ease-in-out infinite;
                    border-radius: 6px;
                }
            `}</style>
        {/* Header skeleton */}
        <div
          style={{
            height: 56,
            background: C.card,
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 12,
          }}
        >
          <div className="sf-skel" style={{ width: 32, height: 32, borderRadius: '50%' }} />
          <div className="sf-skel" style={{ flex: 1, height: 14, maxWidth: 140 }} />
          <div className="sf-skel" style={{ width: 32, height: 32, borderRadius: '50%' }} />
        </div>
        {/* Stories row skeleton */}
        <div style={{ display: 'flex', gap: 12, padding: '16px 16px 8px', overflowX: 'hidden' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div className="sf-skel" style={{ width: 60, height: 60, borderRadius: '50%' }} />
              <div className="sf-skel" style={{ width: 48, height: 10 }} />
            </div>
          ))}
        </div>
        {/* Post card skeletons */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              background: C.card,
              borderRadius: 12,
              margin: '8px 0',
              padding: 16,
              border: `1px solid ${C.border}`,
            }}
          >
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div
                className="sf-skel"
                style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div className="sf-skel" style={{ width: '55%', height: 13, marginBottom: 8 }} />
                <div className="sf-skel" style={{ width: '35%', height: 11 }} />
              </div>
            </div>
            <div className="sf-skel" style={{ width: '90%', height: 14, marginBottom: 10 }} />
            <div className="sf-skel" style={{ width: '75%', height: 14, marginBottom: 14 }} />
            {i === 1 && (
              <div
                className="sf-skel"
                style={{ width: '100%', height: 200, borderRadius: 10, marginBottom: 14 }}
              />
            )}
            <div style={{ display: 'flex', gap: 16 }}>
              {[60, 70, 60].map((w, j) => (
                <div key={j} className="sf-skel" style={{ width: w, height: 12 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <PageTransition>
      {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
      {showIntro && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            ref={introVideoRef}
            src="/videos/social-media-intro.mp4"
            autoPlay
            muted
            playsInline
            onPlay={handleIntroPlay}
            onEnded={handleIntroEnd}
            onError={handleIntroEnd}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          {/* Skip button */}
          <button
            onClick={handleIntroEnd}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              padding: '8px 20px',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 20,
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              zIndex: 100000,
            }}
          >
            Skip
          </button>
        </div>
      )}
      <SEOHead
        title="Social Hub - Poker Community & Feed"
        description="Connect With Poker Players Worldwide. Share Updates, Follow Friends, Join Discussions, And Build Your Poker Network On The Smarter.Poker Social Hub."
        canonical="/hub/social-media"
      />

      {/* Slide-out Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 999,
          }}
        />
      )}

      {/* Slide-out Sidebar Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 320,
          background: C.card,
          zIndex: 1000,
          boxShadow: '2px 0 10px rgba(0,0,0,0.2)',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
          overflowY: 'auto',
          paddingBottom: 80,
        }}
      >
        {/* Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: '#f0f0f0',
              border: 'none',
              width: 32,
              height: 32,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>

        {/* Active Identity Switcher */}
        {user && (
          <div style={{ margin: '0 12px 16px', background: C.card, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.15)', border: '1px solid ' + C.border, overflow: 'hidden' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: ownedPages.length > 0 ? `1px solid ${C.border}` : 'none' }}>
                <Avatar src={isClubMode && clubPage ? clubPage.avatar_url : user.avatar} name={isClubMode && clubPage ? clubPage.name : user.name} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 17, color: isClubMode ? C.blue : 'inherit' }}>
                    {isClubMode && clubPage ? clubPage.name : user.name}
                  </div>
                  <Link href={isClubMode && clubPage ? `/hub/social-pages/${clubPage.id}` : `/hub/profile`} onClick={() => setSidebarOpen(false)} style={{ fontSize: 13, color: C.textSec, textDecoration: 'none' }}>
                    View Profile
                  </Link>
                </div>
                {(() => {
                  const unread = notifications.filter((n) => !n.read).length;
                  if (!unread || isClubMode) return null; // Notifications are for personal right now
                  return (
                    <div
                      style={{ background: C.blue, color: 'white', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}
                    >
                      {unread > 9 ? '9+' : unread}
                    </div>
                  );
                })()}
             </div>
             
             {/* Switch Options (if any owned pages) */}
             {ownedPages.length > 0 && (
                 <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 0' }}>
                     <div style={{ padding: '0 16px 8px', fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: 'uppercase' }}>Switch Account</div>
                     
                     {isClubMode && (
                         <div 
                           onClick={() => { switchToPersonal(); setSidebarOpen(false); }}
                           style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'background 0.2s' }}
                           onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                           onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                         >
                            <Avatar src={user.avatar} name={user.name} size={32} />
                            <div style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{user.name} (Personal)</div>
                         </div>
                     )}
                     
                     {ownedPages.map(page => {
                         if (isClubMode && clubPage?.id === page.id) return null;
                         return (
                             <div 
                               key={page.id}
                               onClick={() => { switchToClub(page); setSidebarOpen(false); }}
                               style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'background 0.2s' }}
                               onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                               onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                             >
                                <Avatar src={page.avatar_url} name={page.name} size={32} />
                                <div style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{page.name}</div>
                             </div>
                         );
                     })}
                 </div>
             )}
          </div>
        )}

        {/* Poker Resume - Show when HendonMob is linked */}
        {user?.hendon && (
          <Link
            href={user.username ? `/hub/user/${user.username}` : '/hub/profile'}
            onClick={() => setSidebarOpen(false)}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <div
              style={{
                margin: '0 12px 16px',
                padding: 16,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 100%)',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 215, 0, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>Trophy</span>
                <div>
                  <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 14 }}>
                    POKER RESUME
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                    Tournament Stats
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#FFD700', fontSize: 18, fontWeight: 700 }}>
                    {user.hendon.cashes || '—'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>CASHES</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#00ff88', fontSize: 18, fontWeight: 700 }}>
                    ${user.hendon.earnings?.toLocaleString() || '—'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>EARNINGS</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#00d4ff', fontSize: 18, fontWeight: 700 }}>
                    {user.hendon.biggestCash ? `$${user.hendon.biggestCash.toLocaleString()}` : '—'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>BIGGEST CASH</div>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Your Shortcuts - Dynamic from Owned Pages */}
        {ownedPages.length > 0 && (
          <div style={{ padding: '0 16px', marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: C.textSec, marginBottom: 12 }}>
              Your Shortcuts
            </h4>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
              {ownedPages.slice(0, 3).map((page) => (
                <Link
                  key={page.id}
                  href={`/hub/social-pages/${page.id}`}
                  onClick={() => setSidebarOpen(false)}
                  style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit', flexShrink: 0, width: 64 }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      margin: '0 auto',
                      borderRadius: 12,
                      background: page.avatar_url ? `url(${page.avatar_url}) center/cover` : 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
                      border: '1px solid ' + C.border,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 700,
                    }}
                  >
                    {!page.avatar_url && page.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 6, color: C.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {page.name}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Menu Grid - Custom AI-Generated Smarter.Poker Icons */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            padding: '0 16px',
            marginBottom: 16,
          }}
        >
          {/* Friends - Custom AI icon */}
          <Link
            href="/hub/friends"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 12px',
              background: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              border: '1px solid #dadde1',
            }}
          >
            <img
              src="/icons/friends.png"
              alt=""
              style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Friends</span>
          </Link>
          {/* Club Arena - Purple columns SVG (fallback) */}
          <Link
            href="/hub/club-arena"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 12px',
              background: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              border: '1px solid #dadde1',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
              <rect x="2" y="6" width="6" height="14" rx="1" fill="#8b5cf6" />
              <rect x="9" y="3" width="6" height="17" rx="1" fill="#a78bfa" />
              <rect x="16" y="6" width="6" height="14" rx="1" fill="#c4b5fd" />
              <ellipse cx="12" cy="20" rx="10" ry="2" fill="#ddd6fe" opacity="0.5" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Club Arena</span>
          </Link>
          {/* Diamond Store - Custom AI icon */}
          <Link
            href="/hub/diamond-store"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 12px',
              background: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              border: '1px solid #dadde1',
            }}
          >
            <img
              src="/icons/diamond.png"
              alt=""
              style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Diamond Store</span>
          </Link>
          {/* Tournaments - Custom AI icon */}
          <Link
            href="/hub/tournaments"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 12px',
              background: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              border: '1px solid #dadde1',
            }}
          >
            <img
              src="/icons/tournaments.png"
              alt=""
              style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Tournaments</span>
          </Link>
          {/* Club Pages - Venue/Tour/Series Pages (inline view) */}
          <div
            onClick={() => {
              setShowClubPages(true);
              setSidebarOpen(false);
              router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true });
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 12px',
              background: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              border: '1px solid #dadde1',
              cursor: 'pointer',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
              <rect x="2" y="3" width="20" height="18" rx="2" fill="#1877F2" opacity="0.15" />
              <rect x="2" y="3" width="20" height="7" rx="2" fill="#1877F2" opacity="0.3" />
              <circle cx="8" cy="14" r="2" fill="#1877F2" />
              <rect x="12" y="13" width="8" height="2" rx="1" fill="#1877F2" opacity="0.6" />
              <rect x="12" y="17" width="5" height="1.5" rx="0.75" fill="#1877F2" opacity="0.3" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Club Pages</span>
          </div>
          {/* GTO Training - Custom AI icon */}
          <Link
            href="/hub/gto-trainer"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 12px',
              background: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              border: '1px solid #dadde1',
            }}
          >
            <img
              src="/icons/gto.png"
              alt=""
              style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>GTO Training</span>
          </Link>
          {/* Reels - Custom AI icon */}
          <Link
            href="/hub/reels"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 12px',
              background: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              border: '1px solid #dadde1',
            }}
          >
            <img
              src="/icons/reels.png"
              alt=""
              style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Reels</span>
          </Link>
        </div>

        {/* Additional Navigation Items */}
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Link
              href="/hub/profile"
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '14px 12px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                border: '1px solid #dadde1',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 8 }}
              >
                <circle cx="12" cy="12" r="11" fill="#e3f2fd" />
                <circle cx="12" cy="9" r="4" fill="#1877f2" />
                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="#1877f2" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Profile</span>
            </Link>
            <Link
              href="/hub/messenger"
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '14px 12px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                border: '1px solid #dadde1',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 8 }}
              >
                <path
                  d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
                  fill="#0084ff"
                />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Messenger</span>
            </Link>
            <Link
              href="/hub/lives"
              prefetch={false}
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '14px 12px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                border: '1px solid #dadde1',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 8 }}
              >
                <circle cx="12" cy="12" r="11" fill="#ff4444" />
                <circle cx="12" cy="12" r="5" fill="white" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Lives</span>
            </Link>
            <Link
              href="/hub/news"
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '14px 12px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                border: '1px solid #dadde1',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 8 }}
              >
                <rect x="3" y="4" width="18" height="16" rx="2" fill="#4267B2" />
                <rect x="6" y="8" width="6" height="4" fill="white" />
                <rect x="6" y="14" width="12" height="2" fill="white" opacity="0.7" />
                <rect x="14" y="8" width="4" height="2" fill="white" opacity="0.7" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>News</span>
            </Link>
            <Link
              href="/hub/poker-near-me/lobby"
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '14px 12px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                border: '1px solid #dadde1',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 8 }}
              >
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                  fill="#ea4335"
                />
                <circle cx="12" cy="9" r="3" fill="white" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Poker Near Me</span>
            </Link>
            <div
              onClick={() => {
                setSidebarOpen(false);
                setShowNotifications(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '14px 12px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                border: '1px solid #dadde1',
                cursor: 'pointer',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 8 }}
              >
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" fill="#f5a623" />
                <path d="M13.73 21a2 2 0 01-3.46 0" stroke="#f5a623" strokeWidth="2" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Notifications</span>
            </div>
            {/* Invite Friends Card */}
            <div
              onClick={() => {
                if (!user) {
                  toast.error('Please log in to invite friends.');
                  return;
                }
                setShowInviteModal(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '14px 12px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                border: '1px solid #dadde1',
                cursor: 'pointer',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 8 }}
              >
                <circle cx="9" cy="7" r="4" fill="#1877F2" />
                <path d="M2 21v-2a7 7 0 0114 0v2" fill="#1877F2" opacity="0.5" />
                <line
                  x1="19"
                  y1="8"
                  x2="19"
                  y2="14"
                  stroke="#1877F2"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="16"
                  y1="11"
                  x2="22"
                  y2="11"
                  stroke="#1877F2"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>
                Invite Friends
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Links */}
        <div style={{ padding: '0 16px' }}>
          <Link
            href="/hub/help"
            onClick={() => setSidebarOpen(false)}
            style={{
              padding: '12px 0',
              borderTop: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#65676b"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            <span style={{ flex: 1, fontSize: 15 }}>Help And Support</span>
            <span style={{ color: C.textSec }}>›</span>
          </Link>
          <Link
            href="/hub/settings"
            onClick={() => setSidebarOpen(false)}
            style={{
              padding: '12px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#65676b"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span style={{ flex: 1, fontSize: 15 }}>Settings</span>
            <span style={{ color: C.textSec }}>›</span>
          </Link>
          <button
            onClick={() => {
              setSidebarOpen(false);
              supabase.auth.signOut().finally(() => {
                // BUG FIX (Bug #11): match the full cache purge from settings.js handleLogout.
                // Missing keys (sp-cached-header-user, sp-vip-status, etc.) left stale avatar
                // and VIP badge data visible after switching accounts.
                try {
                  localStorage.removeItem('sp-social-user');
                } catch (_) {}
                try {
                  localStorage.removeItem('sp-vip-status');
                } catch (_) {}
                try {
                  localStorage.removeItem('smarter-poker-auth');
                } catch (_) {}
                try {
                  localStorage.removeItem('sp-cached-header-user');
                } catch (_) {}
                try {
                  localStorage.removeItem('sp-cached-settings-profile');
                } catch (_) {}
                try {
                  localStorage.removeItem('sp-notif-count');
                } catch (_) {}
                window.top.location.href = '/';
              });
            }}
            style={{
              padding: '12px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              width: '100%',
              textAlign: 'left',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#65676b"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span style={{ flex: 1, fontSize: 15 }}>Sign Out</span>
          </button>
        </div>
      </div>

      <div
        style={{
          minHeight: '100vh',
          background: '#0a0e1a',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
          paddingBottom: 70,
          width: '100%',
          maxWidth: '100vw',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Standard Hub Header with Hamburger Menu */}
        <UniversalHeader
          pageDepth={showClubPages ? 2 : 1}
          showSearch={false}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Global Search Overlay */}
        {showGlobalSearch && (
          <div
            style={{
              position: 'fixed',
              top: 60,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 998,
            }}
            onClick={() => setShowGlobalSearch(false)}
          />
        )}
        {showGlobalSearch && (
          <div
            style={{
              position: 'fixed',
              top: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 600,
              background: C.card,
              borderRadius: '0 0 12px 12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              zIndex: 999,
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: C.bg,
                  borderRadius: 24,
                  padding: '0 16px',
                }}
              >
                {/* BUG-07 FIX: was empty <span> with no icon */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.textSec}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={globalSearchQuery}
                  onChange={(e) => handleGlobalSearch(e.target.value)}
                  placeholder="Search Smarter.Poker..."
                  autoFocus
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    padding: '12px 0',
                    fontSize: 16,
                    outline: 'none',
                  }}
                />
                {globalSearchQuery && (
                  <button
                    onClick={() => {
                      setGlobalSearchQuery('');
                      setGlobalSearchResults({ users: [], posts: [] });
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: C.textSec,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Search Results */}
            {globalSearchLoading && (
              <div style={{ padding: '20px', textAlign: 'center', color: C.textSec }}>
                Searching...
              </div>
            )}

            {!globalSearchLoading && globalSearchQuery.length >= 2 && (
              <div>
                {/* Users */}
                {globalSearchResults.users.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    <div
                      style={{
                        padding: '12px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.textSec,
                      }}
                    >
                      People
                    </div>
                    {globalSearchResults.users.map((u) => (
                      <Link
                        key={u.id}
                        href={`/hub/user/${u.username}`}
                        onClick={() => setShowGlobalSearch(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 16px',
                          textDecoration: 'none',
                          color: 'inherit',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Avatar src={u.avatar_url} name={u.username} size={40} />
                        <div style={{ fontWeight: 500 }}>{u.username}</div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Posts */}
                {globalSearchResults.posts.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    <div
                      style={{
                        padding: '12px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.textSec,
                      }}
                    >
                      Posts
                    </div>
                    {globalSearchResults.posts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setShowGlobalSearch(false);
                        }}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>
                          {p.author?.username || 'Player'}
                        </div>
                        <div style={{ fontSize: 14, color: C.text }}>
                          {p.content?.slice(0, 100)}
                          {p.content?.length > 100 ? '...' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* No results */}
                {globalSearchResults.users.length === 0 &&
                  globalSearchResults.posts.length === 0 && (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textSec }}>
                      {/* BUG-08 FIX: was empty div with no icon */}
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={C.textSec}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ marginBottom: 8, opacity: 0.5 }}
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      No results found for "{globalSearchQuery}"
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Notification Full-Screen Modal */}
        {showNotifications && (
          <>
            <style>{`
                        .notif-modal-backdrop {
                            position: fixed;
                            top: 0; left: 0; right: 0; bottom: 0;
                            background: rgba(0,0,0,0.5);
                            z-index: 9999;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .notif-modal-panel {
                            position: relative;
                            width: 100%;
                            max-width: 520px;
                            height: 90vh;
                            background: #ffffff;
                            border-radius: 16px;
                            box-shadow: 0 8px 40px rgba(0,0,0,0.3);
                            display: flex;
                            flex-direction: column;
                            overflow: hidden;
                            margin: 0 12px;
                        }
                        @media (max-width: 600px) {
                            .notif-modal-backdrop {
                                align-items: flex-end;
                            }
                            .notif-modal-panel {
                                max-width: 100%;
                                width: 100%;
                                height: 92vh;
                                border-radius: 16px 16px 0 0;
                                margin: 0;
                            }
                        }
                    `}</style>
            <div
              className="notif-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowNotifications(false);
              }}
            >
              <div className="notif-modal-panel">
                {/* Header */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${C.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>
                    Notifications
                  </h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {notifications.some((n) => !n.read) && (
                      <button
                        onClick={async () => {
                          const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
                          if (unreadIds.length === 0) return;
                          try {
                            // BUG-35 FIX: Was calling supabase client directly, bypassing server-side cache.
                            // Now routes through mark-read API which invalidates the feed cache.
                            let accessToken = null;
                            try {
                              const authData = JSON.parse(
                                localStorage.getItem('smarter-poker-auth') || '{}'
                              );
                              accessToken = authData?.access_token || null;
                            } catch (_) {}
                            await fetch('/api/notifications/mark-read', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                              },
                              body: JSON.stringify({ ids: unreadIds }),
                            });
                            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                            broadcastSync('smarter_poker_notif_sync', 'refresh_notifications');
                            eventBus.emit(
                              EventType.NOTIFICATIONS_READ,
                              { count: unreadIds.length },
                              'ManualMarkAllRead'
                            );
                            busEmit.dataMutated('notifications');
                            toast.success('All notifications marked as read');
                          } catch (e) {
                            toast.error('Could not mark as read');
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: C.blue,
                          fontWeight: 600,
                          padding: '4px 8px',
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      style={{
                        background: C.bg,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 18,
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: C.text,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {/* Scrollable notification list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '60px 24px', textAlign: 'center', color: C.textSec }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                        No Notifications Yet
                      </div>
                      <div style={{ fontSize: 14 }}>
                        When Someone Interacts With Your Posts Or Profile, You'll See It Here.
                      </div>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const actionIcon =
                        n.type === 'like'
                          ? '👍'
                          : n.type === 'comment'
                            ? '💬'
                            : n.type === 'mention'
                              ? '@'
                              : n.type === 'friend_request'
                                ? '👤'
                                : n.type === 'live'
                                  ? '🔴'
                                  : '🔔';
                      const iconBg =
                        n.type === 'like'
                          ? '#1877F2'
                          : n.type === 'comment'
                            ? '#44BD32'
                            : n.type === 'live'
                              ? '#FA383E'
                              : n.type === 'friend_request'
                                ? '#1877F2'
                                : '#65676B';

                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            setShowNotifications(false);
                            // BUG-09 FIX: was always navigating to actor profile.
                            // Like/comment/mention → deep-link to the specific post.
                            // Live → open the stream viewer directly.
                            // Friend request / other → actor profile.
                            if (n.type === 'live') {
                              // Try to open stream viewer directly
                              const streamId = n.data?.stream_id || n.link?.split('stream=')[1];
                              if (streamId) {
                                (async () => {
                                  try {
                                    const stream = await LiveStreamService.getStream(streamId);
                                    if (stream && stream.status === 'live') {
                                      setWatchingStream(stream);
                                    } else {
                                      toast.info('This stream has ended');
                                    }
                                  } catch (_) {
                                    toast.info('This stream is no longer available');
                                  }
                                })();
                              }
                            } else {
                              const postId = n.data?.post_id;
                              if (
                                (n.type === 'like' ||
                                  n.type === 'comment' ||
                                  n.type === 'mention') &&
                                postId
                              ) {
                                router.push(`/hub/social-media?post=${postId}`);
                              } else if (n.actor_username) {
                                router.push(`/hub/user/${n.actor_username}`);
                              }
                            }
                          }}
                          style={{
                            padding: '14px 20px',
                            borderBottom: `1px solid ${C.border}`,
                            display: 'flex',
                            gap: 14,
                            alignItems: 'flex-start',
                            cursor: 'pointer',
                            background: n.read ? 'transparent' : 'rgba(24, 119, 242, 0.06)',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = n.read
                              ? 'rgba(0,0,0,0.03)'
                              : 'rgba(24,119,242,0.1)')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = n.read
                              ? 'transparent'
                              : 'rgba(24,119,242,0.06)')
                          }
                        >
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <img
                              src={
                                n.actor_avatar_url || n.data?.actor_avatar || '/default-avatar.png'
                              }
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '2px solid #ddd',
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: iconBg,
                                border: '2px solid white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                              }}
                            >
                              {actionIcon}
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, color: C.text, lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 700 }}>
                                {n.actor_name || n.data?.actor_name || n.title}
                              </span>{' '}
                              {n.message}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: n.read ? C.textSec : C.blue,
                                marginTop: 4,
                                fontWeight: n.read ? 400 : 600,
                              }}
                            >
                              {timeAgo(n.created_at)}
                            </div>
                          </div>
                          {!n.read && (
                            <div
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: C.blue,
                                flexShrink: 0,
                                marginTop: 8,
                              }}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Main Feed - 800px Design Canvas */}
        <main
          className="social-page-container"
          style={{
            padding: 0,
            width: '100%',
            maxWidth: '100%',
            overflowX: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* ===== CLUB PAGES: CREATE MODAL ===== */}
          {showCreatePage && isCommander && (
            <ClubPageCreateModal
              C={C}
              commanderData={commanderData}
              userId={user?.id}
              onCreated={(page) => {
                setMyClubPage(page);
                setShowCreatePage(false);
                setShowPageDashboard(true);
              }}
              onClose={() => setShowCreatePage(false)}
            />
          )}

          {/* ===== CLUB PAGE DASHBOARD (Owner) ===== */}
          {showClubPages && showPageDashboard && myClubPage && (
            <ClubPageDashboard
              C={C}
              page={myClubPage}
              userId={user?.id}
              userName={user?.username || user?.name}
              onBack={() => setShowPageDashboard(false)}
              onPageUpdated={(updated) => setMyClubPage(updated)}
              onGoLive={() => setShowGoLiveModal(true)}
            />
          )}

          {/* ===== PUBLIC LIVE GAME BOARD (Any User) ===== */}
          {showClubPages && viewingLiveGamesPage && (
            <PublicGameBoard
              C={C}
              pageId={viewingLiveGamesPage.id}
              pageName={viewingLiveGamesPage.name}
              userId={user?.id}
              userName={user?.username || user?.name || ''}
              onClose={() => setViewingLiveGamesPage(null)}
            />
          )}

          {/* ===== CLUB PAGES VIEW (Browse) ===== */}
          {showClubPages && !showPageDashboard && !viewingLiveGamesPage && (
            <>
              {/* Commander Banner — Create or Manage Page */}
              {isCommander && !myPageLoading && (
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 8,
                    border: '1px solid #CCD0D5',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                >
                  {myClubPage ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 10,
                            background: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 22,
                            fontWeight: 800,
                            color: '#1877F2',
                            flexShrink: 0,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                          }}
                        >
                          {(myClubPage.metadata || {}).logo_url ? (
                            <img
                              src={myClubPage.metadata.logo_url}
                              alt={myClubPage.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            (myClubPage.name || 'C')[0].toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#050505' }}>
                            {myClubPage.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#65676B', marginTop: 1 }}>
                            {CATEGORY_LABELS[myClubPage.category] || myClubPage.category || 'Club'}{' '}
                            · {myClubPage.follower_count || 0} followers
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setShowPageDashboard(true)}
                          style={{
                            padding: '8px 20px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#1877F2',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Manage Page
                        </button>
                        <button
                          onClick={() => setViewingLiveGamesPage(myClubPage)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#E4E6EB',
                            color: '#050505',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Live Games
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#050505' }}>
                          Create Your Club Page
                        </span>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#65676B' }}>
                          Set Up A Public Page For Your Venue
                        </p>
                      </div>
                      <button
                        onClick={() => setShowCreatePage(true)}
                        style={{
                          padding: '8px 20px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#fff',
                          color: '#1877F2',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Create Page
                      </button>
                    </div>
                  )}
                </div>
              )}
              <ClubPagesView
                C={C}
                pages={clubPages}
                setPages={setClubPages}
                loading={clubPagesLoading}
                setLoading={setClubPagesLoading}
                category={clubPagesCategory}
                setCategory={setClubPagesCategory}
                search={clubPagesSearch}
                setSearch={setClubPagesSearch}
                followingIds={clubPagesFollowing}
                setFollowingIds={setClubPagesFollowing}
                onClose={() => {
                  setShowClubPages(false);
                  router.replace('/hub/social-media', undefined, { shallow: true });
                }}
                onViewLiveGames={setViewingLiveGamesPage}
              />
            </>
          )}

          {/* ===== NORMAL FEED ===== */}
          {!showClubPages && (
            <>
              <div
                className="social-feed-layout"
                style={{
                  display: 'flex',
                  gap: 16,
                  justifyContent: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div className="social-feed-column" style={{ flex: 1, minWidth: 0 }}>
                  {/* Stories Bar */}
                  {user && (
                    <StoriesBar
                      userId={user.id}
                      userAvatar={user.avatar}
                      onOpenLive={(stream) => setWatchingStream(stream)}
                    />
                  )}

                  {/* Post Creator */}
                  {user && (
                    <SharedPostCreator
                      context="social-media"
                      user={user}
                      onPost={handlePost}
                      isPosting={isPosting}
                      onGoLive={() => setShowGoLiveModal(true)}
                      onOpenClubPages={() => {
                        setShowClubPages(true);
                        router.replace('/hub/social-media?view=club-pages', undefined, {
                          shallow: true,
                        });
                      }}
                    />
                  )}

                  {/* Ghost Post — shows placeholder card during background video upload */}
                  {user && <GhostPostCard user={user} />}

                  {/* Login prompt — only show after auth check completes */}
                  {!user && !loading && (
                    <div
                      style={{
                        background: C.card,
                        borderRadius: 8,
                        padding: 24,
                        textAlign: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <p style={{ color: C.textSec, marginBottom: 12 }}>
                        Log In To Post And Interact!
                      </p>
                      <Link
                        href="/auth/login"
                        style={{
                          display: 'inline-block',
                          padding: '10px 24px',
                          background: C.blue,
                          color: 'white',
                          borderRadius: 6,
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        Log In
                      </Link>
                    </div>
                  )}

                  {/* LIVE STREAMS SECTION */}
                  {liveStreams.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <h4
                        style={{
                          margin: '0 0 10px 4px',
                          fontSize: 16,
                          fontWeight: 700,
                          color: C.text,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        🔴 Live Now
                      </h4>
                      <div
                        style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}
                      >
                        {liveStreams.map((stream) => (
                          <div key={stream.id} style={{ flexShrink: 0, width: 280 }}>
                            <LiveStreamCard
                              stream={stream}
                              onClick={() => setWatchingStream(stream)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pull-to-refresh indicator */}
                  {pullRefreshState !== 'idle' && (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '12px 0',
                        color: C.textSec,
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {pullRefreshState === 'pulling'
                        ? '\u2193 Release to refresh'
                        : '\u21bb Refreshing...'}
                    </div>
                  )}

                  {/* Club Posts Filter — only visible for Commander users */}
                  {hasClubPage && clubPage && posts.length > 0 && (
                    <div
                      style={{ padding: '6px 12px', display: 'flex', justifyContent: 'flex-end' }}
                    >
                      <button
                        onClick={() => setShowClubPostsOnly((prev) => !prev)}
                        style={{
                          background: showClubPostsOnly ? '#E7F3FF' : 'transparent',
                          border: `1px solid ${showClubPostsOnly ? '#1877F2' : C.border}`,
                          borderRadius: 20,
                          padding: '5px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: showClubPostsOnly ? '#1877F2' : C.textSec,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        {showClubPostsOnly && <span style={{ fontSize: 11 }}>✓</span>}
                        My Club Posts
                      </button>
                    </div>
                  )}

                  {/* Posts Feed */}
                  {posts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 24px', color: C.textSec }}>
                      <div style={{ fontSize: 56, marginBottom: 12 }}>🎰</div>
                      <h3 style={{ color: C.text, fontSize: 18, marginBottom: 8 }}>
                        Welcome to Smarter.Poker
                      </h3>
                      <p style={{ marginBottom: 16, lineHeight: 1.5 }}>
                        Your poker community feed is empty. Follow players, join clubs, or share
                        your first hand to get started!
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Link
                          href="/hub/friends"
                          style={{
                            padding: '8px 16px',
                            background: C.blue,
                            color: 'white',
                            borderRadius: 20,
                            fontWeight: 600,
                            textDecoration: 'none',
                            fontSize: 13,
                          }}
                        >
                          Find Players
                        </Link>
                        <span
                          onClick={() => {
                            const input = document.querySelector(
                              '[placeholder*="What\'s on your mind"]'
                            );
                            if (input) {
                              input.scrollIntoView({ behavior: 'smooth' });
                              setTimeout(() => input.focus(), 400);
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            background: C.card,
                            color: C.text,
                            borderRadius: 20,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: 13,
                            border: `1px solid ${C.border}`,
                          }}
                        >
                          Create a Post
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Render posts with Reels carousel inserted after every 3 posts */}
                      {(() => {
                        const filteredPosts = posts
                          .filter((p) => !blockedUserIds.has(p.authorId))
                          .filter(
                            (p) =>
                              !showClubPostsOnly ||
                              p.isClubPagePost ||
                              p.metadata?.source_page_id === clubPage?.id
                          );
                        if (showClubPostsOnly && filteredPosts.length === 0) {
                          return (
                            <div
                              style={{
                                textAlign: 'center',
                                padding: '48px 24px',
                                color: C.textSec,
                              }}
                            >
                              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                              <h3 style={{ color: C.text, fontSize: 16, marginBottom: 8 }}>
                                No Club Posts Yet
                              </h3>
                              <p style={{ marginBottom: 16, lineHeight: 1.5, fontSize: 13 }}>
                                Post as your club to see content here!
                              </p>
                              <button
                                onClick={() => setShowClubPostsOnly(false)}
                                style={{
                                  padding: '8px 20px',
                                  background: C.blue,
                                  color: 'white',
                                  borderRadius: 6,
                                  fontWeight: 600,
                                  fontSize: 13,
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                }}
                              >
                                Clear Filter
                              </button>
                            </div>
                          );
                        }
                        return filteredPosts.map((p, index) => (
                          <React.Fragment key={p.id}>
                            <PostCard
                              post={{ ...p, isGodMode }}
                              currentUserId={user?.id}
                              currentUserName={user?.name}
                              currentUserAvatar={user?.avatar}
                              onLike={handleLike}
                              onDelete={handleDelete}
                              onComment={(postId) => {
                                // Optimistically update commentCount in parent's post list
                                setPosts((prev) =>
                                  prev.map((post) =>
                                    post.id === postId
                                      ? { ...post, commentCount: (post.commentCount || 0) + 1 }
                                      : post
                                  )
                                );
                              }}
                              onBlock={handleBlockUser}
                              onShare={(postObj, onSuccess) =>
                                setShareModalPost({ ...postObj, _onSuccess: onSuccess })
                              }
                              onOpenArticle={(url) => {
                                // All articles open in-app via the proxy reader.
                                // Cardplayer.com is handled via RSS fallback in /api/proxy — no redirect needed.
                                setArticleReader({ open: true, url, title: p.link_title || null });
                              }}
                              horseProfileIds={horseProfileIds}
                            />
                            {/* Insert Reels carousel after 3rd post */}
                            {index === 2 && <ReelsFeedCarousel key="reels-carousel" />}
                            {/* Insert Share Streak Leaderboard after 5th post */}
                            {index === 4 && (
                              <ShareStreakLeaderboard
                                key="share-streak-lb"
                                currentUserId={user?.id}
                              />
                            )}
                          </React.Fragment>
                        ));
                      })()}

                      {/* Leaderboard fallback: show after all posts if feed has < 5 posts */}
                      {(() => {
                        const fp = posts
                          .filter((p) => !blockedUserIds.has(p.authorId))
                          .filter(
                            (p) =>
                              !showClubPostsOnly ||
                              p.isClubPagePost ||
                              p.metadata?.source_page_id === clubPage?.id
                          );
                        return fp.length < 5 ? (
                          <ShareStreakLeaderboard
                            key="share-streak-lb-fallback"
                            currentUserId={user?.id}
                          />
                        ) : null;
                      })()}

                      {/* ♾️ INFINITE SCROLL: Load more trigger */}
                      <div
                        ref={loadMoreCallbackRef}
                        style={{
                          padding: '20px',
                          textAlign: 'center',
                          minHeight: 60,
                        }}
                      >
                        {loadingMore && (
                          <>
                            {/* Skeleton Post Placeholders */}
                            {[1, 2].map((i) => (
                              <div
                                key={`skeleton-${i}`}
                                style={{
                                  background: C.card,
                                  borderRadius: 8,
                                  padding: 16,
                                  marginBottom: 12,
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                }}
                              >
                                {/* Skeleton header */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    marginBottom: 16,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 40,
                                      height: 40,
                                      borderRadius: '50%',
                                      background: '#E4E6EB',
                                      animation: 'pulse 1.5s infinite',
                                    }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        width: 120,
                                        height: 12,
                                        background: '#E4E6EB',
                                        borderRadius: 6,
                                        marginBottom: 6,
                                        animation: 'pulse 1.5s infinite',
                                      }}
                                    />
                                    <div
                                      style={{
                                        width: 80,
                                        height: 10,
                                        background: '#E4E6EB',
                                        borderRadius: 5,
                                        animation: 'pulse 1.5s infinite',
                                      }}
                                    />
                                  </div>
                                </div>
                                {/* Skeleton content */}
                                <div style={{ marginBottom: 12 }}>
                                  <div
                                    style={{
                                      width: '100%',
                                      height: 10,
                                      background: '#E4E6EB',
                                      borderRadius: 5,
                                      marginBottom: 8,
                                      animation: 'pulse 1.5s infinite',
                                    }}
                                  />
                                  <div
                                    style={{
                                      width: '80%',
                                      height: 10,
                                      background: '#E4E6EB',
                                      borderRadius: 5,
                                      animation: 'pulse 1.5s infinite',
                                    }}
                                  />
                                </div>
                                {/* Skeleton image placeholder */}
                                <div
                                  style={{
                                    width: '100%',
                                    height: 200,
                                    background: '#E4E6EB',
                                    borderRadius: 8,
                                    animation: 'pulse 1.5s infinite',
                                  }}
                                />
                              </div>
                            ))}
                          </>
                        )}
                        {!hasMorePosts && posts.length > 0 && (
                          <p style={{ color: C.textSec, fontSize: 14, textAlign: 'center' }}>
                            You're all caught up! Check back later for new content.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Layout CSS — rendered outside of posts conditional so it always applies */}
                  <style>{`
                                    @keyframes spin {
                                        to { transform: rotate(360deg); }
                                    }
                                    @keyframes pulse {
                                        0%, 100% { opacity: 1; }
                                        50% { opacity: 0.5; }
                                    }
                                    .social-feed-column {
                                        max-width: 680px;
                                        overflow-x: hidden;
                                    }
                                    .social-contacts-sidebar {
                                        width: 220px;
                                        flex-shrink: 0;
                                    }
                                    @media (max-width: 768px) {
                                        .social-feed-column {
                                            max-width: 100% !important;
                                            width: 100% !important;
                                        }
                                        .social-feed-layout {
                                            gap: 0 !important;
                                            width: 100% !important;
                                            padding: 0 !important;
                                        }
                                        .social-page-container {
                                            padding: 0 !important;
                                            width: 100% !important;
                                            max-width: 100vw !important;
                                            overflow-x: hidden !important;
                                        }
                                    }
                                    @media (max-width: 900px) {
                                        .social-contacts-sidebar { display: none; }
                                    }
                                `}</style>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Bottom Navigation Bar - SmarterPoker Style with SVG Icons */}
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 56,
            background: '#ffffff',
            borderTop: '1px solid #dddfe2',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'stretch',
            zIndex: 100,
            transform: bottomNavVisible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.3s ease',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Home - Outline house */}
          <Link
            href="/hub/social-media"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: '#65676b',
              flex: 1,
              padding: '6px 4px',
              minWidth: 50,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
            </svg>
            <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Home</span>
          </Link>
          {/* Reels - Rounded rect with play triangle */}
          <Link
            href="/hub/reels"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: '#65676b',
              flex: 1,
              padding: '6px 4px',
              minWidth: 50,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
            </svg>
            <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Reels</span>
          </Link>
          {/* Friends - Connected people icon */}
          <Link
            href="/hub/friends"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: '#65676b',
              flex: 1,
              padding: '6px 4px',
              minWidth: 50,
              position: 'relative',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="3" />
              <circle cx="16" cy="8" r="3" />
              <path d="M8 11a4 4 0 00-4 4v2h8v-2a4 4 0 00-4-4z" />
              <path d="M16 11c1.5 0 2.8.8 3.5 2 .4.8.5 1.3.5 2v2h-6" />
            </svg>
            <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Friends</span>
          </Link>
          {/* Clubs - Star in rounded box (Events-style) */}
          <Link
            href="/hub/social-media?view=club-pages"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: '#65676b',
              flex: 1,
              padding: '6px 4px',
              minWidth: 50,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path
                d="M12 8l1.5 3 3.5.5-2.5 2.5.5 3.5L12 16l-3 1.5.5-3.5-2.5-2.5 3.5-.5z"
                fill="currentColor"
              />
            </svg>
            <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Clubs</span>
          </Link>
          {/* Notifications - Filled bell (blue when active) */}
          <div
            onClick={() => setShowNotifications(true)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: '#1877f2',
              flex: 1,
              padding: '6px 4px',
              minWidth: 50,
              position: 'relative',
              cursor: 'pointer',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a7 7 0 00-7 7c0 3.5-1.5 5.5-2.5 7-.3.4-.5.8-.5 1.2 0 .5.5.8 1 .8h18c.5 0 1-.3 1-.8 0-.4-.2-.8-.5-1.2-1-1.5-2.5-3.5-2.5-7a7 7 0 00-7-7z" />
              <path d="M10 20a2 2 0 004 0" />
            </svg>
            {notifications.filter((n) => !n.read).length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 'calc(50% - 18px)',
                  background: '#f02849',
                  color: 'white',
                  borderRadius: 10,
                  minWidth: 18,
                  height: 18,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  padding: '0 5px',
                }}
              >
                {notifications.filter((n) => !n.read).length}
              </div>
            )}
            <span style={{ fontSize: 10, marginTop: 2, fontWeight: 600, color: '#1877f2' }}>
              Notifications
            </span>
          </div>
          {/* Profile - Avatar or person icon */}
          <Link
            href="/hub/profile"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: '#65676b',
              flex: 1,
              padding: '6px 4px',
              minWidth: 50,
            }}
          >
            {user ? (
              <Avatar
                src={user.avatar}
                name={user.name}
                size={28}
                style={{ border: '2px solid #e4e6eb', borderRadius: '50%' }}
              />
            ) : (
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
              </svg>
            )}
            <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Profile</span>
          </Link>
        </nav>

        {/* Go Live Modal */}
        <GoLiveModal
          isOpen={showGoLiveModal}
          onClose={(action) => {
            setShowGoLiveModal(false);
            LiveStreamService.getLiveStreams()
              .then((streams) => setLiveStreams(streams || []))
              .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
            if (action === 'posted') {
              loadFeed();
            }
          }}
          user={user}
        />

        {/* Live Stream Viewer Modal */}
        {watchingStream && (
          <LiveStreamViewer
            stream={watchingStream}
            userId={user?.id}
            user={user}
            onClose={() => {
              setWatchingStream(null);
              // Refresh live streams
              LiveStreamService.getLiveStreams()
                .then(setLiveStreams)
                .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
            }}
          />
        )}
      </div>

      {/* In-App Article Reader Modal */}
      {articleReader.open && (
        <ArticleReaderModal
          url={articleReader.url}
          title={articleReader.title}
          onClose={() => setArticleReader({ open: false, url: null, title: null })}
        />
      )}

      {/* Delete Post Confirmation Modal */}
      {deletePostId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete post confirmation"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDeletePostId(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setDeletePostId(null)}
        >
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: 24,
              maxWidth: 320,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Delete This Post?
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>
              This post will be removed from the feed. You have a few seconds to close this dialog
              and undo the deletion before it is permanent.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setDeletePostId(null)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: C.bg,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 20,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePost}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#F02849',
                  color: 'white',
                  border: 'none',
                  borderRadius: 20,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scroll-to-top FAB — hidden during live stream viewing */}
      {showScrollTop && !watchingStream && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: 'fixed',
            bottom: 80,
            right: 20,
            zIndex: 999,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: C.blue,
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            fontWeight: 700,
            boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            opacity: 1,
          }}
          title="Back to top"
        >
          ↑
        </button>
      )}

      {/* Invite Friends Modal */}
      <InviteFriendsModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        user={user}
        contacts={contacts}
        onOpenChat={handleOpenChat}
        onSearch={handleSearch}
        searchResults={searchResults}
      />

      {/* Share Post Modal (V2: Share To Feed + Send To Friend) */}
      {shareModalPost && (
        <SharePostModal
          post={shareModalPost}
          authorUsername={shareModalPost?.author?.username}
          currentUser={
            user
              ? { id: user.id, username: user.username || user.name, avatar_url: user.avatar }
              : null
          }
          onClose={() => setShareModalPost(null)}
          onShared={(platform) => {
            if (shareModalPost._onSuccess) shareModalPost._onSuccess();
            // Refresh feed after sharing to feed
            if (platform === 'feed') {
              setPosts((prev) => [...prev]); // trigger re-render
            }
          }}
        />
      )}
    </PageTransition>
  );
}

export default function SocialMediaPageWithBoundary() {
  return (
    <HubErrorBoundary name="SocialMedia">
      <SocialProfileGateForCurrentUser />
      <SocialMediaPage />
    </HubErrorBoundary>
  );
}
