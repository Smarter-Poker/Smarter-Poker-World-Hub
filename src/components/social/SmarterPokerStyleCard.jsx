/**
 * 🌐 smarter-poker-style FEED CARD
 * src/app/social/components/SmarterPokerStyleCard.jsx
 *
 * Light, bright, familiar SmarterPoker UI with poker integration
 */

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getAuthorDisplayName } from '../../utils/displayName';
import TranscodeStatusBadge from './TranscodeStatusBadge';
import { YouTubePosterImg } from './SharedVideoComponents';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 SMARTERPOKER COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════

export const SP_COLORS = {
  blue: '#1877F2',
  blueHover: '#166FE5',
  blueLight: '#E7F3FF',
  bgMain: '#F0F2F5',
  bgWhite: '#FFFFFF',
  bgHover: '#F2F2F2',
  textPrimary: '#050505',
  textSecondary: '#65676B',
  divider: '#E4E6EB',
  shadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
  // Poker accents (subtle)
  pokerOrange: '#FF6B35',
  pokerGreen: '#22C55E',
  pokerGold: '#FFD700',
};

// ═══════════════════════════════════════════════════════════════════════════
// 👤 USER AVATAR
// ═══════════════════════════════════════════════════════════════════════════

export const SPAvatar = ({ src, name, size = 40, online = false }) => (
  <div className="sp-avatar-container" style={{ position: 'relative', width: size, height: size }}>
    <img
      src={src || '/default-avatar.png'}
      alt={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
      }}
    />
    {online && (
      <span
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 12,
          height: 12,
          background: '#31A24C',
          border: '2px solid white',
          borderRadius: '50%',
        }}
      />
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📝 CREATE POST BOX
// ═══════════════════════════════════════════════════════════════════════════

export const CreatePostBox = ({ user, onPost }) => (
  <div className="sp-create-post">
    <div className="sp-create-post-header">
      <SPAvatar src={user?.avatar} name={user?.name} size={40} />
      <button className="sp-create-input">
        What's on your mind, {user?.firstName || 'there'}?
      </button>
    </div>
    <div className="sp-create-divider" />
    <div className="sp-create-actions">
      <button className="sp-create-btn live">
        <span className="icon">🔴</span> Live Session
      </button>
      <button className="sp-create-btn photo">
        <span className="icon">📷</span> Photo/Video
      </button>
      <button className="sp-create-btn hand">
        <span className="icon">🃏</span> Share Hand
      </button>
    </div>

    <style>{`
            .sp-create-post {
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: ${SP_COLORS.shadow};
                margin-bottom: 16px;
                padding: 12px 16px;
            }

            .sp-create-post-header {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .sp-create-input {
                flex: 1;
                background: ${SP_COLORS.bgMain};
                border: none;
                border-radius: 20px;
                padding: 10px 16px;
                font-size: 17px;
                color: ${SP_COLORS.textSecondary};
                text-align: left;
                cursor: pointer;
            }

            .sp-create-input:hover {
                background: ${SP_COLORS.bgHover};
            }

            .sp-create-divider {
                height: 1px;
                background: ${SP_COLORS.divider};
                margin: 12px 0;
            }

            .sp-create-actions {
                display: flex;
                justify-content: space-around;
            }

            .sp-create-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                background: transparent;
                border: none;
                border-radius: 6px;
                font-size: 15px;
                font-weight: 600;
                color: ${SP_COLORS.textSecondary};
                cursor: pointer;
            }

            .sp-create-btn:hover {
                background: ${SP_COLORS.bgHover};
            }

            .sp-create-btn.live .icon { color: #F02849; }
            .sp-create-btn.photo .icon { color: #45BD62; }
            .sp-create-btn.hand .icon { color: ${SP_COLORS.pokerOrange}; }

            .sp-create-btn .icon {
                font-size: 20px;
            }
        `}</style>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎥 FEED VIDEO PLAYER (Intersection Observer Autoplay)
// ═══════════════════════════════════════════════════════════════════════════

// BUG FIX: Solves the "black background" issue for native videos on iOS.
// The old `#t=0.001` trick failed to render on iOS because Safari refuses to
// decode the frame until playback actually starts. By using an IntersectionObserver,
// we auto-play the video ONLY when it's >50% visible, and pause it when scrolled
// away. This exactly matches the Reels playback behavior (which the user confirmed
// works) AND prevents the OOM crashes that happen if 20 videos play simultaneously.
// CHUNK-BUST-2026-05-06-A: bumping a literal string here so Vercel's build
// cache stops reusing the pre-fix bundle and ships the first-frame fallback
// + thumb-fallback chain that DID land in source but never reached the wire.
// (When FeedVideoPlayer mounts in dev only this logs once; production minifies
// the if-block away because process.env.NODE_ENV is inlined.)
const _FEED_VIDEO_PLAYER_BUILD_TAG = 'sp-feed-video-2026-05-06A';
export const FeedVideoPlayer = ({ src }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(
        '[FeedVideoPlayer]',
        _FEED_VIDEO_PLAYER_BUILD_TAG,
        'mounted',
        src?.slice(0, 60)
      );
    }
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Force the media engine to decode and play
            video.play().catch((e) => {
              // Ignore standard Autoplay prevented errors if any
            });
          } else {
            // Pause off-screen to prevent iOS HEVC OOM crash
            video.pause();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(video);
    return () => {
      observer.unobserve(video);
      observer.disconnect();
    };
  }, []);

  // FIRST-FRAME FALLBACK (2026-05-06 per Dan: "social-media displays black
  // background with play button, not first frame or selected thumbnail").
  // Posts that don't have thumbnail_url set yet (live-stream replays before
  // transcode finishes, or videos still in the queue) used to render as a
  // pure black <video preload="metadata"> element — the browser fetches
  // metadata but doesn't decode any frame.
  //
  // Appending `#t=0.001` to the source URL is the standard cross-browser
  // trick: the media engine seeks to 0.001s, decodes that frame, and
  // renders it as the visible poster. Works on Chrome/Firefox/iOS Safari
  // 17+. Negligible bandwidth cost (a few extra KB to fetch the first
  // keyframe). When the IntersectionObserver later calls play(), the
  // existing decoded frame transitions smoothly into playback.
  //
  // Skip the fragment if src already has one (defensive). Skip for blob:
  // URLs (rare; staging tile uses different component anyway).
  const playableSrc = (() => {
    if (!src || typeof src !== 'string') return src;
    if (src.startsWith('blob:')) return src;
    if (src.includes('#t=')) return src; // already has a time fragment
    return `${src}#t=0.001`;
  })();

  return (
    <video
      ref={videoRef}
      src={playableSrc}
      preload="metadata"
      muted
      playsInline
      loop
      style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
      onError={(e) => {
        // Replace broken video with gradient placeholder
        const parent = e.target.parentElement;
        if (parent) {
          const placeholder = document.createElement('div');
          placeholder.style.cssText =
            'width:100%;height:100%;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:center;';
          placeholder.innerHTML = '<span style="font-size:32px;opacity:0.5">🎬</span>';
          parent.replaceChild(placeholder, e.target);
        }
      }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📰 POST CARD
// ═══════════════════════════════════════════════════════════════════════════

// Reaction emoji map
const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like', color: '#1877F2' },
  { type: 'love', emoji: '❤️', label: 'Love', color: '#E0245E' },
  { type: 'haha', emoji: '😂', label: 'Haha', color: '#F7B928' },
  { type: 'wow', emoji: '😮', label: 'Wow', color: '#F7B928' },
  { type: 'sad', emoji: '😢', label: 'Sad', color: '#F7B928' },
  { type: 'fire', emoji: '🔥', label: 'Fire', color: '#FF6B35' },
];

export const SPPostCard = ({
  post,
  user,
  onLike,
  onComment,
  onShare,
  onSubmitComment,
  onLoadComments,
  onDeletePost,
  currentUserId,
}) => {
  const router = useRouter();
  const [liked, setLiked] = useState(post.userLiked || post.isLiked || false);
  const [reactionType, setReactionType] = useState(post.reactionType || 'like');
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState(post.comments || []);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const likePendingRef = useRef(false);
  const submittingCommentRef = useRef(false);
  const moreMenuRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const reactionPickerRef = useRef(null);

  // Sync liked/reactionType from parent when props change (EventBus cross-user updates)
  useEffect(() => {
    setLiked(post.userLiked || post.isLiked || false);
    if (post.reactionType) setReactionType(post.reactionType);
  }, [post.isLiked, post.userLiked, post.reactionType]);

  // Click-outside dismiss for more menu
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  // Click-outside dismiss for reaction picker
  useEffect(() => {
    if (!showReactionPicker) return;
    const handleClickOutside = (e) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target)) {
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReactionPicker]);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Support both old and new data structures
  const author = user || post.author || post.user;
  const authorName = getAuthorDisplayName(author);
  const authorAvatar = author?.avatar || author?.avatarUrl || null;
  const authorTier =
    author?.tier || (author?.isShark ? 'SHARK' : author?.isGTO ? 'GTO_MASTER' : null);

  // Support both flat and nested engagement structures
  const likeCount = post.engagement?.likeCount ?? post.likeCount ?? 0;
  const commentCount = post.engagement?.commentCount ?? post.commentCount ?? 0;
  const shareCount = post.engagement?.shareCount ?? post.shareCount ?? 0;

  // Support both content and text properties
  const postContent = post.content || post.text;

  const formatTime = (timestamp) => {
    const now = new Date();
    const postTime = new Date(timestamp);
    const diffMs = now - postTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return postTime.toLocaleDateString();
  };

  // Like with proper async error handling + rollback
  const handleLike = async (selectedType = 'like') => {
    if (likePendingRef.current) return; // prevent rapid fire
    likePendingRef.current = true;
    setShowReactionPicker(false);

    const wasLiked = liked;
    const prevType = reactionType;

    // Determine if this is a SWAP (already liked, different type) or TOGGLE
    const isSwap = wasLiked && selectedType !== prevType;

    // Optimistic UI
    if (isSwap) {
      // Swap: stay liked, just change the type
      setReactionType(selectedType);
    } else {
      // Toggle: flip liked state
      setLiked(!wasLiked);
      if (!wasLiked) setReactionType(selectedType);
    }

    try {
      await onLike?.(post.id, selectedType);
    } catch {
      // Rollback on failure
      setLiked(wasLiked);
      setReactionType(prevType);
    }
    likePendingRef.current = false;
  };

  // Long-press handlers for reaction picker
  const handleLikeMouseDown = () => {
    longPressTimerRef.current = setTimeout(() => {
      setShowReactionPicker(true);
      longPressTimerRef.current = null;
    }, 500);
  };

  const handleLikeMouseUp = () => {
    if (longPressTimerRef.current) {
      // Short press — toggle like
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      handleLike('like');
    }
  };

  const handleLikeMouseLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Select a specific reaction from picker
  const handleSelectReaction = (type) => {
    handleLike(type);
  };

  // Get current reaction emoji for display
  const currentReaction = REACTIONS.find((r) => r.type === reactionType) || REACTIONS[0];
  const likeButtonColor = liked ? currentReaction.color || SP_COLORS.blue : SP_COLORS.textSecondary;

  // Toggle comments and load existing ones on first open
  const handleToggleComments = async () => {
    const willShow = !showComments;
    setShowComments(willShow);
    if (willShow && !commentsLoaded && onLoadComments) {
      try {
        const fetchedComments = await onLoadComments(post.id);
        if (fetchedComments?.length > 0) setComments(fetchedComments);
        setCommentsLoaded(true);
      } catch {
        /* fail silently — show existing comments */
      }
    }
  };

  // Submit comment on Enter key
  const handleCommentSubmit = async (e) => {
    if (e.key !== 'Enter' || !commentText.trim() || submittingCommentRef.current) return;
    const text = commentText.trim();
    submittingCommentRef.current = true;
    setCommentText('');

    // Optimistic append
    const optimisticComment = {
      id: Date.now(),
      content: text,
      author: { username: 'You', avatarUrl: null },
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimisticComment]);

    try {
      await onSubmitComment?.(post.id, text);
    } catch (err) {
      console.warn('Comment failed, syncing authoritative state:', err);
      // Re-fetch authoritative state on error instead of manual rollback
      try {
        const fetched = await onLoadComments?.(post.id);
        if (fetched) setComments(fetched);
      } catch (e) {
        // Fallback if fetch fails
        setComments((prev) => prev.filter(c => c.id !== optimisticComment.id));
      }
      setCommentText(text); // Restore text so user can try again
    }
    submittingCommentRef.current = false;
  };

  // Delete post
  const handleDelete = async () => {
    setShowMoreMenu(false);
    if (window.confirm('Delete this post? This cannot be undone.')) {
      await onDeletePost?.(post.id);
    }
  };

  const isOwnPost =
    currentUserId &&
    (post.author_id === currentUserId ||
      post.author?.id === currentUserId ||
      post.authorId === currentUserId);

  // Share → copy link to clipboard + show toast
  const handleShare = async () => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/app/social/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2000);
    onShare?.(post.id);
  };

  return (
    <div className="sp-post">
      {/* Header */}
      <div className="sp-post-header">
        <SPAvatar src={authorAvatar} name={authorName} size={40} online={author?.online} />
        <div className="sp-post-meta">
          <div className="sp-post-author">
            <span className="sp-post-name">{authorName}</span>
            {authorTier === 'SHARK' && <span className="badge-shark">🦈 Shark</span>}
            {authorTier === 'GTO_MASTER' && <span className="badge-gto">👑 GTO</span>}
            {author?.isVerified && <span className="badge-verified">✓</span>}
          </div>
          <div className="sp-post-time">{formatTime(post.createdAt)} · 🌐</div>
        </div>
        <div className="sp-post-more-container" style={{ position: 'relative' }} ref={moreMenuRef}>
          <button className="sp-post-more" onClick={() => setShowMoreMenu(!showMoreMenu)}>
            ⋯
          </button>
          {showMoreMenu && (
            <div className="sp-more-dropdown">
              {isOwnPost && onDeletePost && (
                <button className="sp-more-item danger" onClick={handleDelete}>
                  Delete Post
                </button>
              )}
              <button className="sp-more-item" onClick={() => setShowMoreMenu(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transcoding status indicator — shows 'Processing...' for newly uploaded videos */}
      <TranscodeStatusBadge postId={post.id} mediaType={post.media_type || post.mediaType} />

      {/* Content */}
      <div className="sp-post-content">
        {postContent && <p className="sp-post-text">{postContent}</p>}

        {/* Hand History (Poker-specific) */}
        {post.handData && (
          <div className="sp-hand-embed">
            <div className="sp-hand-header">
              <span className="stakes">{post.handData.stakes}</span>
              <span className={`result ${post.handData.won ? 'win' : 'loss'}`}>
                {post.handData.won ? '+' : '-'}${post.handData.amount}
              </span>
            </div>
            <div className="sp-hand-cards">
              {post.handData.heroCards?.map((card, i) => (
                <span
                  key={i}
                  className={`playing-card ${card.includes('♥') || card.includes('♦') ? 'red' : 'black'}`}
                >
                  {card}
                </span>
              ))}
              {post.handData.board && (
                <>
                  <span className="board-label">Board:</span>
                  {post.handData.board.map((card, i) => (
                    <span
                      key={i}
                      className={`playing-card board ${card.includes('♥') || card.includes('♦') ? 'red' : 'black'}`}
                    >
                      {card}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Live Stream Preview — Bug 13 fix: show thumbnail + LIVE badge for live posts */}
        {(post.contentType === 'live' || post.content_type === 'live') && (
          <div
            onClick={() => {
              const id = post.metadata?.lives_id || post.metadata?.stream_id;
              if (id) router.push(`/hub/lives?id=${id}`);
            }}
            style={{
              position: 'relative',
              cursor: 'pointer',
              borderRadius: 12,
              overflow: 'hidden',
              aspectRatio: '16/9',
              background: '#111',
              margin: '8px 0',
            }}
          >
            {post.thumbnailUrl || post.thumbnail_url ? (
              <img
                src={post.thumbnailUrl || post.thumbnail_url}
                alt="Live stream"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 48 }}>🎥</span>
              </div>
            )}
            {!post.metadata?.ended && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  background: '#ef4444',
                  color: 'white',
                  padding: '3px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
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
                    animation: 'livePulse 1.2s ease-in-out infinite',
                  }}
                />
                LIVE NOW
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.85)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#111">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <style>{`
                            @keyframes livePulse {
                                0%, 100% { opacity: 1; transform: scale(1); }
                                50% { opacity: 0.4; transform: scale(1.3); }
                            }
                        `}</style>
          </div>
        )}

        {/* Media Grid - supports multiple images/videos */}
        {(post.mediaUrls?.length > 0 || post.media) && (
          <div className="sp-post-media">
            {/* Support both array and single item */}
            {post.mediaUrls?.length > 0 ? (
              <div className={`media-grid media-count-${Math.min(post.mediaUrls.length, 4)}`}>
                {post.mediaUrls.slice(0, 4).map((media, idx) => {
                  const mediaUrl = typeof media === 'string' ? media : media.url;
                  const mediaType = typeof media === 'string' ? media : media.type;
                  // Detect video URLs: YouTube, Shorts, or video file extensions
                  const isVideo =
                    mediaType?.startsWith('video') ||
                    mediaUrl?.includes('youtube.com') ||
                    mediaUrl?.includes('youtu.be') ||
                    mediaUrl?.match(/\.(mp4|webm|mov|avi)(\?|$)/i);

                  return (
                    <div
                      key={idx}
                      className="media-item"
                      onClick={() => {
                        if (isVideo) {
                          // BUG FIX (SC-1): Live replay posts must navigate to
                          // /hub/lives?id= not /hub/reels. Live replays are stored
                          // in live_streams (not social_reels), so the Reels viewer
                          // cannot resolve them — produces a black screen.
                          const meta = post.metadata;
                          if (
                            meta?.source === 'live_replay' &&
                            (meta?.lives_id || meta?.stream_id)
                          ) {
                            router.push(`/hub/lives?id=${meta.lives_id || meta.stream_id}`);
                          } else {
                            router.push(`/hub/reels?id=${post.id}`);
                          }
                        }
                      }}
                      style={isVideo ? { cursor: 'pointer' } : {}}
                    >
                      {isVideo ? (
                        <>
                          {(() => {
                            // AUDIT-8 (2026-04-30 per Dan): the feed used to ALWAYS
                            // render an <img> for video posters. When thumbnail_url
                            // was null AND the URL wasn't YouTube, the YouTube
                            // regex match failed and produced an
                            // 'https://img.youtube.com/vi/undefined/hqdefault.jpg'
                            // 404 → black tile. Now we branch:
                            //   • Real thumbnail URL → <img> (cheap, cacheable)
                            //   • YouTube source → YouTube poster <img>
                            //   • Otherwise (uploaded video w/ no thumbnail yet —
                            //     cron hasn't run) → autoplay-once <video> that
                            //     decodes the first frame and pauses, same
                            //     pattern as the staging tile in SharedPostCreator.
                            const thumb =
                              media.thumbnail || post.thumbnailUrl || post.thumbnail_url;
                            const ytId = mediaUrl?.match(
                              /(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]+)/
                            )?.[1];
                            if (thumb) {
                              return (
                                <img
                                  src={thumb}
                                  alt={`Video ${idx + 1}`}
                                  loading="lazy"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              );
                            }
                            if (ytId) {
                              // 2026-08-15 poster-quality fix: maxres→sd→hq
                              // ladder instead of pinned 480×360 hqdefault.
                              return (
                                <YouTubePosterImg
                                  videoId={ytId}
                                  alt={`Video ${idx + 1}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              );
                            }
                            // AUDIT-9 SUPERSEDED (2026-05-04):
                            // The old autoplay <video> caused OOM on iPhone.
                            // The `#t=0.001` fallback often rendered black on iOS
                            // because Safari won't decode without playback.
                            // Now we use FeedVideoPlayer which plays ONLY when
                            // on-screen via IntersectionObserver.
                            return <FeedVideoPlayer src={mediaUrl} />;
                          })()}
                          {/* Play Button Overlay */}
                          <div className="video-play-overlay">
                            <div className="play-button">▶</div>
                          </div>
                        </>
                      ) : (
                        <img src={mediaUrl} alt={`Media ${idx + 1}`} loading="lazy" />
                      )}
                      {idx === 3 && post.mediaUrls.length > 4 && (
                        <div className="more-media-overlay">+{post.mediaUrls.length - 4}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <img src={post.media} alt="Post" />
            )}
          </div>
        )}
      </div>

      {/* Reactions Count */}
      <div className="sp-post-reactions">
        <div className="reaction-icons">
          <span className="reaction-emoji">👍</span>
          <span className="reaction-emoji">❤️</span>
          <span className="reaction-emoji">🔥</span>
        </div>
        <span className="reaction-count">{likeCount}</span>
        <div className="comment-share-count">
          {commentCount > 0 && <span>{commentCount} comments</span>}
          {shareCount > 0 && <span>{shareCount} shares</span>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="sp-post-actions">
        <div style={{ position: 'relative', flex: 1 }} ref={reactionPickerRef}>
          {/* Reaction Picker Flyout */}
          {showReactionPicker && (
            <div className="sp-reaction-picker">
              {REACTIONS.map((r) => (
                <button
                  key={r.type}
                  className="sp-reaction-option"
                  onClick={() => handleSelectReaction(r.type)}
                  title={r.label}
                >
                  <span className="sp-reaction-emoji-btn">{r.emoji}</span>
                </button>
              ))}
            </div>
          )}
          <button
            className={`sp-action-btn ${liked ? 'liked' : ''}`}
            style={{ width: '100%', color: liked ? likeButtonColor : undefined }}
            onMouseDown={handleLikeMouseDown}
            onMouseUp={handleLikeMouseUp}
            onMouseLeave={handleLikeMouseLeave}
            onTouchStart={handleLikeMouseDown}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleLikeMouseUp();
            }}
          >
            <span className="icon">{liked ? currentReaction.emoji : '👍'}</span>
            <span>{liked ? currentReaction.label : 'Like'}</span>
          </button>
        </div>
        <button className="sp-action-btn" onClick={handleToggleComments}>
          <span className="icon">💬</span>
          <span>Comment</span>
        </button>
        <button className="sp-action-btn" onClick={handleShare}>
          <span className="icon">↗️</span>
          <span>Share</span>
        </button>
      </div>

      {/* Share Toast */}
      {shareToast && (
        <div
          style={{
            padding: '8px 16px',
            background: '#323232',
            color: '#fff',
            fontSize: 14,
            textAlign: 'center',
            borderRadius: '0 0 8px 8px',
          }}
        >
          Link Copied To Clipboard
        </div>
      )}

      {/* Comments */}
      {showComments && (
        <div className="sp-comments">
          <div className="sp-comment-input">
            <SPAvatar size={32} />
            <input
              type="text"
              placeholder="Write A Comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleCommentSubmit}
              disabled={submittingComment}
            />
          </div>
          {comments.map((comment, i) => (
            <div key={comment.id || i} className="sp-comment">
              <SPAvatar src={comment.user?.avatar || comment.author?.avatarUrl} size={32} />
              <div className="sp-comment-content">
                <span className="sp-comment-author">
                  {getAuthorDisplayName(comment.user || comment.author)}
                </span>
                <span className="sp-comment-text">{comment.text || comment.content}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
                .sp-post {
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: ${SP_COLORS.shadow};
                    margin-bottom: 16px;
                    overflow: hidden;
                }

                .sp-post-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                }

                .sp-post-meta {
                    flex: 1;
                }

                .sp-post-author {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .sp-post-name {
                    font-weight: 600;
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                    cursor: pointer;
                }

                .sp-post-name:hover {
                    text-decoration: underline;
                }

                .badge-shark, .badge-gto {
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-weight: 600;
                }

                .badge-shark {
                    background: ${SP_COLORS.blueLight};
                    color: ${SP_COLORS.blue};
                }

                .badge-gto {
                    background: linear-gradient(135deg, ${SP_COLORS.pokerGold}, #FEF08A);
                    color: #92400E;
                }

                .sp-post-time {
                    font-size: 13px;
                    color: ${SP_COLORS.textSecondary};
                }

                .sp-post-more {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    font-size: 16px;
                    color: ${SP_COLORS.textSecondary};
                    cursor: pointer;
                }

                .sp-post-more:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .sp-more-dropdown {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
                    min-width: 200px;
                    z-index: 100;
                    overflow: hidden;
                }

                .sp-more-item {
                    display: block;
                    width: 100%;
                    padding: 12px 16px;
                    border: none;
                    background: none;
                    text-align: left;
                    font-size: 15px;
                    cursor: pointer;
                    color: ${SP_COLORS.textPrimary};
                }

                .sp-more-item:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .sp-more-item.danger {
                    color: #EF4444;
                }

                .sp-post-content {
                    padding: 0 16px 12px;
                }

                .sp-post-text {
                    font-size: 15px;
                    line-height: 1.34;
                    color: ${SP_COLORS.textPrimary};
                    margin: 0 0 12px;
                }

                /* Hand Embed */
                .sp-hand-embed {
                    background: ${SP_COLORS.bgMain};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 12px;
                }

                .sp-hand-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-weight: 600;
                }

                .stakes { color: ${SP_COLORS.textSecondary}; }
                .result.win { color: ${SP_COLORS.pokerGreen}; }
                .result.loss { color: #EF4444; }

                .sp-hand-cards {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    flex-wrap: wrap;
                }

                .playing-card {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 28px;
                    height: 38px;
                    padding: 0 4px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    font-weight: 700;
                }

                .playing-card.red { color: #DC2626; }
                .playing-card.black { color: #111; }
                .playing-card.board { 
                    background: #f5f5f5;
                    min-width: 24px;
                    height: 32px;
                    font-size: 11px;
                }

                .board-label {
                    font-size: 12px;
                    color: ${SP_COLORS.textSecondary};
                    margin-left: 8px;
                }

                /* Media Grid */
                .sp-post-media {
                    margin-left: -16px;
                    margin-right: -16px;
                }

                .sp-post-media > img {
                    width: 100%;
                    max-height: 600px;
                    object-fit: cover;
                }

                .media-grid {
                    display: grid;
                    gap: 2px;
                }

                .media-grid.media-count-1 {
                    grid-template-columns: 1fr;
                }

                .media-grid.media-count-2 {
                    grid-template-columns: 1fr 1fr;
                }

                .media-grid.media-count-3 {
                    grid-template-columns: 2fr 1fr;
                    grid-template-rows: 1fr 1fr;
                }

                .media-grid.media-count-3 .media-item:first-child {
                    grid-row: span 2;
                }

                .media-grid.media-count-4 {
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr;
                }

                .media-item {
                    position: relative;
                    overflow: hidden;
                    min-height: 150px;
                    max-height: 300px;
                    background: ${SP_COLORS.bgMain};
                }

                .media-item img,
                .media-item video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .media-item video {
                    background: #000;
                }

                .more-media-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 32px;
                    font-weight: 700;
                }

                /* Video Play Button Overlay */
                .video-play-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                }

                .video-play-overlay .play-button {
                    width: 64px;
                    height: 64px;
                    background: rgba(255, 255, 255, 0.9);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    color: #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                .media-item:hover .video-play-overlay .play-button {
                    background: rgba(255, 255, 255, 1);
                    transform: scale(1.05);
                }

                /* Reactions */
                .sp-post-reactions {
                    display: flex;
                    align-items: center;
                    padding: 10px 16px;
                    border-bottom: 1px solid ${SP_COLORS.divider};
                }

                .reaction-icons {
                    display: flex;
                    margin-right: 4px;
                }

                .reaction-emoji {
                    font-size: 16px;
                    margin-left: -4px;
                }

                .reaction-emoji:first-child {
                    margin-left: 0;
                }

                .reaction-count {
                    font-size: 15px;
                    color: ${SP_COLORS.textSecondary};
                    margin-right: auto;
                }

                .comment-share-count {
                    display: flex;
                    gap: 16px;
                    font-size: 15px;
                    color: ${SP_COLORS.textSecondary};
                }

                /* Actions */
                .sp-post-actions {
                    display: flex;
                    padding: 4px 8px;
                }

                .sp-action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px 0;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    color: ${SP_COLORS.textSecondary};
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .sp-action-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .sp-action-btn.liked {
                    color: ${SP_COLORS.blue};
                }

                .sp-action-btn .icon {
                    font-size: 18px;
                }

                /* Reaction Picker */
                .sp-reaction-picker {
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    gap: 2px;
                    padding: 6px 8px;
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 28px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    z-index: 200;
                    animation: reactionFadeIn 0.2s ease;
                    margin-bottom: 6px;
                }

                @keyframes reactionFadeIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.9); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }

                .sp-reaction-option {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: none;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                    transition: transform 0.15s ease;
                }

                .sp-reaction-option:hover {
                    transform: scale(1.35);
                    background: ${SP_COLORS.bgHover};
                }

                .sp-reaction-emoji-btn {
                    font-size: 24px;
                    line-height: 1;
                }

                /* Comments */
                .sp-comments {
                    padding: 8px 16px 16px;
                    background: ${SP_COLORS.bgMain};
                }

                .sp-comment-input {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .sp-comment-input input {
                    flex: 1;
                    background: ${SP_COLORS.bgWhite};
                    border: none;
                    border-radius: 20px;
                    padding: 8px 16px;
                    font-size: 15px;
                }

                .sp-comment {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 8px;
                }

                .sp-comment-content {
                    background: ${SP_COLORS.bgWhite};
                    padding: 8px 12px;
                    border-radius: 18px;
                }

                .sp-comment-author {
                    font-weight: 600;
                    font-size: 13px;
                    color: ${SP_COLORS.textPrimary};
                    margin-right: 4px;
                }

                .sp-comment-text {
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                }
            `}</style>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📖 STORIES ROW
// ═══════════════════════════════════════════════════════════════════════════

export const FBStoriesRow = ({ stories = [], currentUser }) => {
  return (
    <div className="sp-stories">
      {/* Create Story */}
      <div className="sp-story create">
        <div className="story-bg">
          <img src={currentUser?.avatar || '/default-avatar.png'} alt="" />
        </div>
        <div className="create-btn">+</div>
        <span className="story-label">Create Story</span>
      </div>

      {/* User Stories */}
      {stories.map((story, i) => (
        <div key={i} className={`sp-story ${story.viewed ? '' : 'unviewed'}`}>
          <img src={story.thumbnail} alt="" className="story-bg" />
          <div className="story-avatar-ring">
            <img src={story.user?.avatar} alt={story.user?.name} />
          </div>
          <span className="story-label">{story.user?.firstName || story.user?.name}</span>
        </div>
      ))}

      <style>{`
                .sp-stories {
                    display: flex;
                    gap: 8px;
                    padding: 16px;
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: ${SP_COLORS.shadow};
                    margin-bottom: 16px;
                    overflow-x: auto;
                }

                .sp-stories::-webkit-scrollbar {
                    display: none;
                }

                .sp-story {
                    position: relative;
                    width: 112px;
                    height: 200px;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    flex-shrink: 0;
                }

                .sp-story:hover {
                    transform: scale(1.02);
                }

                .sp-story .story-bg,
                .sp-story > img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .sp-story.create {
                    background: linear-gradient(to bottom, transparent 60%, ${SP_COLORS.bgWhite} 60%);
                }

                .sp-story.create .story-bg {
                    height: 70%;
                    border-radius: 12px 12px 0 0;
                    overflow: hidden;
                }

                .sp-story.create .story-bg img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .create-btn {
                    position: absolute;
                    top: 60%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 40px;
                    height: 40px;
                    background: ${SP_COLORS.blue};
                    border: 4px solid ${SP_COLORS.bgWhite};
                    border-radius: 50%;
                    color: white;
                    font-size: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .story-avatar-ring {
                    position: absolute;
                    top: 12px;
                    left: 12px;
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    padding: 3px;
                    background: linear-gradient(135deg, ${SP_COLORS.blue}, #00D9FF);
                }

                .sp-story.unviewed .story-avatar-ring {
                    background: linear-gradient(135deg, ${SP_COLORS.blue}, #00D9FF);
                }

                .story-avatar-ring img {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 3px solid ${SP_COLORS.bgWhite};
                    object-fit: cover;
                }

                .story-label {
                    position: absolute;
                    bottom: 12px;
                    left: 12px;
                    right: 12px;
                    font-size: 13px;
                    font-weight: 600;
                    color: white;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .sp-story.create .story-label {
                    color: ${SP_COLORS.textPrimary};
                    text-shadow: none;
                    text-align: center;
                }
            `}</style>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  SPAvatar,
  CreatePostBox,
  SPPostCard,
  FBStoriesRow,
  SP_COLORS,
};
