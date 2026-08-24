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
        // 2026-08-15 audit: this sent getAnonUserId() ("anon-…", not a UUID)
        // with no bearer token, so the API's follow lookup never ran —
        // is_following was false on every card and "Show Following" always
        // filtered everything out. Send the real user + token instead.
        const authedUser = getAuthUser();
        const accessToken = getAccessToken();
        const baseParams = { sort: 'popular', limit: '80' };
        if (search) baseParams.search = search;
        if (authedUser?.id && accessToken) baseParams.user_id = authedUser.id;
        if (showFollowedOnly && baseParams.user_id) baseParams.followed_only = 'true';
        const fetchHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

        let allPages = [];
        if (category === 'all') {
          // Fetch home_games, charity, clubs in parallel
          const [hgRes, charRes, clubRes] = await Promise.all(
            ['home_games', 'charity', 'clubs'].map((cat) =>
              fetch(
                `/api/poker/pages?${new URLSearchParams({ ...baseParams, category: cat })}`,
                { headers: fetchHeaders }
              ).then((r) => r.json())
            )
          );
          if (hgRes.success) allPages.push(...(hgRes.data || []));
          if (charRes.success) allPages.push(...(charRes.data || []));
          if (clubRes.success) allPages.push(...(clubRes.data || []));
        } else {
          const res = await fetch(
            `/api/poker/pages?${new URLSearchParams({ ...baseParams, category })}`,
            { headers: fetchHeaders }
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

export default ClubPagesView;
