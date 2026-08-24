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

// 2026-08-15 audit: typing-indicator broadcasts used to construct a brand-new
// RealtimeChannel PER KEYSTROKE (supabase.channel() registers a new channel
// object every call) — ~100 leaked channel objects per 30s of typing. One
// module-scope sender instance is enough; send() on an unjoined channel uses
// the HTTP broadcast path, which is exactly what these fire-and-forget
// typing events want.
let _typingSendChannel = null;
function getTypingChannel() {
  if (!_typingSendChannel) _typingSendChannel = supabase.channel('social-feed');
  return _typingSendChannel;
}

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
          const { error: err_social_interactions_1yi55 } = await supabase
            .from('social_interactions')
            .delete()
            .eq('post_id', post.id)
            .eq('user_id', currentUserId)
            .eq('interaction_type', 'bookmark');
          if (err_social_interactions_1yi55) console.warn('[Supabase] Silent mutation failed in social_interactions:', err_social_interactions_1yi55.message);
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
        getTypingChannel()
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
              const { error: err_notifications_h99dp } = await supabase.from('notifications').insert({
                user_id: parentInfo.authorId,
                type: 'reply',
                message: `replied to your comment`,
                data: { actor_id: currentUserId, reference_id: post.id },
              });
              if (err_notifications_h99dp) console.warn('[Supabase] Silent mutation failed in notifications:', err_notifications_h99dp.message);
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
                  const { error: err_notifications_fvbj9 } = await supabase.from('notifications').insert(notifications);
                  if (err_notifications_fvbj9) console.warn('[Supabase] Silent mutation failed in notifications:', err_notifications_fvbj9.message);
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
                aria-label="Delete post"
                title="Delete post"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.textSec,
                  fontSize: 16,
                }}
              >🗑</button>
            </div>
          )}
          {post.authorId !== currentUserId && currentUserId && (
            <>
              <button
                onClick={async () => {
                  if (isReporting) return;
                  setIsReporting(true);
                  try {
                    const { error: err_social_interactions_wwcu4 } = await supabase
                      .from('social_interactions')
                      .delete()
                      .eq('post_id', post.id)
                      .eq('user_id', currentUserId)
                      .eq('interaction_type', 'report');
                    if (err_social_interactions_wwcu4) console.warn('[Supabase] Silent mutation failed in social_interactions:', err_social_interactions_wwcu4.message);
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
                      onClick={() => {
                        setLightboxImages(post.mediaUrls);
                        setLightboxIndex(0);
                        setLightboxUrl(post.mediaUrls[0]);
                      }}
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
            {bookmarked ? '🔖 ' : ''}Save
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
              <span>{(Object.values(typists || {})[0]?.name || 'Someone').split(' ')[0]} is typing</span>
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
                      const ch = getTypingChannel();
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
                        getTypingChannel()
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
      // 2026-08-15 audit: these fields are mutated by the realtime UPDATE
      // handler — omitting them made those updates invisible.
      prevProps.post.thumbnail_url === nextProps.post.thumbnail_url &&
      prevProps.post.mediaUrls === nextProps.post.mediaUrls &&
      prevProps.post.metadata === nextProps.post.metadata &&
      prevProps.post.shareCount === nextProps.post.shareCount &&
      prevProps.currentUserId === nextProps.currentUserId
    );
  }
);

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
                    {/* 2026-08-15 audit: media uploaded fine but was never
                        rendered — club posts showed text only. */}
                    {Array.isArray(post.media_urls) && post.media_urls.length > 0 && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: post.media_urls.length > 1 ? '1fr 1fr' : '1fr',
                          gap: 4,
                          marginTop: 10,
                        }}
                      >
                        {post.media_urls.slice(0, 4).map((mu, mi) =>
                          post.content_type === 'video' && mi === 0 ? (
                            <video
                              key={mi}
                              src={mu}
                              controls
                              playsInline
                              preload="metadata"
                              poster={post.thumbnail_url || undefined}
                              style={{ width: '100%', borderRadius: 8, maxHeight: 360, background: '#000' }}
                            />
                          ) : (
                            <img
                              key={mi}
                              src={mu}
                              alt=""
                              loading="lazy"
                              style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 360 }}
                            />
                          )
                        )}
                      </div>
                    )}
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
              onClick={() => window.open('/hub/commander/tournaments', '_blank')}
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
                      t.id && window.open('/hub/commander/tournaments', '_blank')
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
            onClick={() => lt.id && window.open('/hub/commander/tournaments', '_blank')}
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
export default ClubPageDashboard;
