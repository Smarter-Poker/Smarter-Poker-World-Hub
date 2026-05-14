/**
 * Social Page Detail View - Full page with feed, followers, about, and content management
 * Supports venue, group, community, and brand pages
 */
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveIdentity } from '../../../src/contexts/ActiveIdentityContext';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { SharedPostCreator } from '../../../src/components/social/SharedPostCreator';
import { useAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLight from '../../../src/components/ui/SkeletonLight';
import { supabase } from '../../../src/lib/supabase';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
// Shared social utilities & components (extracted from social-media)
import { SOCIAL_COLORS, timeAgo as sharedTimeAgo, isYouTubeUrl, getYouTubeVideoId, getYouTubeEmbedUrl } from '../../../src/lib/socialHelpers';
import { SharedAvatar } from '../../../src/components/social/SharedAvatar';
import { SharedLinkPreviewCard } from '../../../src/components/social/SharedLinkPreviewCard';
import { VideoThumbnail, VideoPostWrapper, FullScreenVideoViewer } from '../../../src/components/social/SharedVideoComponents';
import toast from '../../../src/stores/toastStore';
// Phase 9: Shared components for full feature parity with social-media
import { GoLiveModal } from '../../../src/components/social/GoLiveModal';
import { LiveStreamCard } from '../../../src/components/social/LiveStreamCard';
import { LiveStreamViewer } from '../../../src/components/social/LiveStreamViewer';
import LiveStreamService from '../../../src/services/LiveStreamService';
import ArticleReaderModal from '../../../src/components/social/ArticleReaderModal';
import CheckInModal from '../../../src/components/social/CheckInModal';
import GiphyPicker from '../../../src/components/shared/GiphyPicker';
import { broadcastSync, listenBroadcast, BROADCAST_TAB_ID } from '../../../src/lib/broadcastSync';

// Lightweight QR Code component — uses goqr.me API (zero dependencies, no Google Charts)
function QRCanvas({ value, size = 140 }) {
    if (!value) return null;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=png&margin=4`;
    return (
        <img
            src={qrSrc}
            alt="QR Code"
            width={size}
            height={size}
            style={{ borderRadius: 8, border: '1px solid #E4E6EB' }}
            onError={(e) => { e.target.style.display = 'none'; }}
        />
    );
}

// Use shared color theme and utilities — single source of truth with social-media
const C = SOCIAL_COLORS;
const timeAgo = sharedTimeAgo;

// Avatar wrapper — uses SharedAvatar for feature parity (online indicator, click-through)
function Avatar({ src, name, size = 40, online, onClick, linkTo }) {
    return <SharedAvatar src={src} name={name} size={size} online={online} onClick={onClick} linkTo={linkTo} />;
}

function PostCard({ post, user, onLike, onComment, onDelete, onPin, onEdit, onDeleteComment, isPageOwner, page, isOwnerOnOwnPage, onOpenArticle }) {
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    // #8: Comment pagination — show first N, expand on demand
    const [commentDisplayLimit, setCommentDisplayLimit] = useState(5);
    const [showMenu, setShowMenu] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState(post.content || '');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const menuRef = useRef(null);
    // #2 Image carousel
    const [carouselIdx, setCarouselIdx] = useState(0);
    // #14 Like animation
    const [likeAnim, setLikeAnim] = useState(false);
    // P9-4: Double-tap like
    const [doubleTapHeart, setDoubleTapHeart] = useState(false);
    const doubleTapTimer = useRef(null);
    // #13 Debounce guard
    const isLikingRef = useRef(false);
    // #1 Reply threading
    const [replyTo, setReplyTo] = useState(null); // comment id
    const [replyText, setReplyText] = useState('');
    // P7-3 Expandable text
    const [expanded, setExpanded] = useState(false);
    // P7-1 Reactions picker
    const [showReactions, setShowReactions] = useState(false);
    const reactionTimer = useRef(null);
    // P8-8: Mobile long-press for reaction picker
    const longPressTimer = useRef(null);
    // P8-11: Comment editing
    const [editingComment, setEditingComment] = useState(null); // comment id
    const [editCommentText, setEditCommentText] = useState('');
    // P12-3: Image lightbox
    const [lightboxUrl, setLightboxUrl] = useState(null);
    // Feature parity: FullScreen video viewer (from social-media)
    const [showCommentsForPost, setShowCommentsForPost] = useState({});
    const [bookmarked, setBookmarked] = useState(false);
    const isSavingRef = useRef(false);
    const pendingCommentLikesRef = useRef(new Set());
    // Phase 3: Comment media (GIF/image attachments)
    const [commentMediaUrl, setCommentMediaUrl] = useState(null);
    const [commentMediaType, setCommentMediaType] = useState(null);
    const [showGifPicker, setShowGifPicker] = useState(false);
    // Phase 3: Typing indicator
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef(null);

    // Feature parity: @mention rendering (from social-media)
    const router = useRouter();
    const renderMentions = (text) => {
        if (!text) return text;
        const parts = text.split(/(@[\w.]+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                const username = part.slice(1);
                return <a key={i} href={`/hub/user/${username}`}
                    style={{ color: C.blue, fontWeight: 600, textDecoration: 'none' }}
                    onClick={(e) => { e.preventDefault(); router.push(`/hub/user/${username}`); }}
                >{part}</a>;
            }
            return part;
        });
    };

    // Phase 4: EventBus Synchronization for real-time cross-tab updates
    // NOTE: eventBus.emit() passes callback({ type, payload, timestamp, source })
    //       — payload is the data object, NOT detail. All handlers read evt.payload.
    //       PostCard manages its own local state (comments list, bookmark).
    //       Post counts (like_count, comment_count) are owned by parent via setPosts
    //       and are already updated by the parent handlers before this event fires.
    useEffect(() => {
        const handleReaction = (evt) => {
            const p = evt.payload || {};
            if (p.postId !== post.id) return;
            // Bookmark state is PostCard-local — update it directly
            if (p.reactionType === 'bookmark' && p.userId === user?.id) {
                setBookmarked(p.action === 'add');
            }
        };

        const handleComment = (evt) => {
            const p = evt.payload || {};
            if (p.postId !== post.id) return;
            if (p.action === 'add' && showComments && user?.id !== p.userId && p.comment) {
                // Append new comment from another user into the visible comments list
                setComments(prev => {
                    if (prev.some(c => c.id === p.comment.id)) return prev;
                    return [...prev, p.comment];
                });
            } else if (p.action === 'remove' && showComments) {
                // Remove deleted comment from the visible comments list
                setComments(prev => prev.filter(c => c.id !== p.commentId));
            }
        };

        eventBus.on(EventType.SOCIAL_REACTION_UPDATE, handleReaction);
        eventBus.on(EventType.SOCIAL_COMMENT_UPDATE, handleComment);

        return () => {
            eventBus.off(EventType.SOCIAL_REACTION_UPDATE, handleReaction);
            eventBus.off(EventType.SOCIAL_COMMENT_UPDATE, handleComment);
        };
    }, [post.id, user?.id, showComments]);

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;
        const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [showMenu]);
    // P7-1: Cleanup reaction timer on unmount to prevent zombie setState
    useEffect(() => {
        return () => {
            if (reactionTimer.current) clearTimeout(reactionTimer.current);
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
        };
    }, []);

    const canManage = isPageOwner || (user && post.author_id === user.id);

    const fetchComments = async () => {
        if (comments.length > 0) { setShowComments(!showComments); return; }
        setLoadingComments(true);
        try {
            // Send Bearer token so engage.js can verify identity for personalized like state
            const token = getAccessToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(`/api/social/pages/engage?post_id=${post.id}`, { headers });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setComments(json.data || []);
        } catch (e) { console.warn("[[pageId].js]", e); }
        setLoadingComments(false);
        setShowComments(true);
    };



    const handleEdit = async () => {
        if (!editContent.trim()) return;
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ id: post.id, content: editContent.trim() }),
            });
            if (res.ok) {
                onEdit(post.id, editContent.trim());
                setEditing(false);
            }
        } catch (e) { console.warn(e); }
    };

    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/hub/social-pages/${page?.slug || page?.id}` : '';

    return (
        <div style={{ background: C.card, borderRadius: 12, border: (post.post_type === 'announcement') ? '2px solid #F5A623' : post.is_pinned ? '2px solid #1877F2' : `1px solid ${C.border}`, marginBottom: 12, overflow: 'hidden', position: 'relative' }}>
            {/* Announcement badge */}
            {post.post_type === 'announcement' && (
                <div style={{ padding: '6px 16px', background: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)', fontSize: 12, fontWeight: 700, color: '#E65100', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#E65100"><path d="M18 8a3 3 0 00-3-3H9a3 3 0 00-3 3v6a3 3 0 003 3h1l-1 4h2l1-4h1l3 4h2l-3-4a3 3 0 003-3V8z"/></svg>
                    ANNOUNCEMENT
                </div>
            )}
            {/* Pinned badge */}
            {post.is_pinned && !post.post_type?.startsWith('announcement') && (
                <div style={{ padding: '6px 16px', background: '#E7F3FF', fontSize: 12, fontWeight: 600, color: C.blue, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={C.blue}><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                    Pinned Post
                </div>
            )}

            {/* Author + Menu */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                <Avatar src={post.author?.avatar_url} name={post.author?.full_name || post.author?.username} size={40} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {post.author?.full_name || post.author?.username || 'Unknown'}
                        {/* P10-9: Owner/Admin badge */}
                        {isPageOwner && post.author_id === (page?.owner_id || page?.created_by) && (
                            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, background: '#E7F3FF', color: C.blue, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>ADMIN</span>
                        )}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec, cursor: 'default' }} title={post.created_at ? new Date(post.created_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}>{timeAgo(post.created_at)}</div>
                </div>
                {/* ⋮ Menu */}
                {canManage && (
                    <div ref={menuRef} style={{ position: 'relative' }}>
                        <button onClick={() => setShowMenu(!showMenu)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                            fontSize: 20, color: C.textSec, borderRadius: 8,
                        }}>⋮</button>
                        {showMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, background: C.card,
                                borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                border: `1px solid ${C.border}`, minWidth: 180, zIndex: 100, overflow: 'hidden',
                            }}>
                                {isPageOwner && (
                                    <button onClick={() => { onPin(post.id, !post.is_pinned); setShowMenu(false); }} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px',
                                        border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                        color: C.text, fontFamily: 'inherit', textAlign: 'left',
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                                        {post.is_pinned ? 'Unpin Post' : 'Pin Post'}
                                    </button>
                                )}
                                <button onClick={() => { setEditing(true); setEditContent(post.content || ''); setShowMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px',
                                    border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                    color: C.text, fontFamily: 'inherit', textAlign: 'left',
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    Edit Post
                                </button>
                                <button onClick={() => { setConfirmDelete(true); setShowMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px',
                                    border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                    color: C.red, fontFamily: 'inherit', textAlign: 'left',
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                    Delete Post
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Content or Edit Mode */}
            {editing ? (
                <div style={{ padding: '0 16px 12px' }}>
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                        fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none', minHeight: 80,
                        background: C.bg, boxSizing: 'border-box',
                    }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditing(false)} style={{
                            padding: '6px 16px', borderRadius: 6, border: `1px solid ${C.border}`,
                            background: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: C.textSec, fontFamily: 'inherit',
                        }}>Cancel</button>
                        <button onClick={handleEdit} style={{
                            padding: '6px 16px', borderRadius: 6, border: 'none',
                            background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}>Save</button>
                    </div>
                </div>
            ) : post.content ? (
                <div onDoubleClick={() => {
                    if (!user) return;
                    if (!post.user_liked) { onLike(post.id); }
                    setDoubleTapHeart(true);
                    if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
                    doubleTapTimer.current = setTimeout(() => setDoubleTapHeart(false), 800);
                }} style={{ padding: '0 16px 12px', fontSize: 14, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', position: 'relative', cursor: 'default' }}>
                    {post.content.length > 300 && !expanded ? (
                        <>{renderMentions(post.content.slice(0, 300))}... <button onClick={() => setExpanded(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: C.textSec, padding: 0, fontFamily: 'inherit' }}>See More</button></>
                    ) : renderMentions(post.content)}
                    {expanded && post.content.length > 300 && (
                        <button onClick={() => setExpanded(false)} style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.textSec, padding: '4px 0 0', fontFamily: 'inherit' }}>See Less</button>
                    )}
                    {/* P9-4: Double-tap heart animation */}
                    {doubleTapHeart && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', animation: 'likePopAnim 0.8s ease-out forwards' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="#F02849" stroke="#F02849" strokeWidth="1">
                                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                            </svg>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Media — #2 Image Carousel with YouTube/Video support (feature parity) */}
            {post.media_urls && post.media_urls.length > 0 && (
                <div style={{ position: 'relative', overflow: 'hidden' }}
                    onDoubleClick={() => {
                        if (!user) return;
                        if (!post.user_liked) { onLike(post.id); }
                        setDoubleTapHeart(true);
                        if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
                        doubleTapTimer.current = setTimeout(() => setDoubleTapHeart(false), 800);
                    }}>
                    {/* Check if media is a YouTube URL or video */}
                    {post.media_urls.length === 1 && isYouTubeUrl(post.media_urls[0]) ? (
                        <div style={{ aspectRatio: '16/9' }}>
                            <iframe
                                src={getYouTubeEmbedUrl(post.media_urls[0])}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    ) : post.media_urls.length === 1 && (post.media_urls[0].endsWith('.mp4') || post.media_urls[0].endsWith('.webm') || post.media_urls[0].endsWith('.mov') || post.media_urls[0].endsWith('.m4v') || post.media_urls[0].endsWith('.hevc')) ? (
                        <div style={{ position: 'relative' }}>
                            <video src={post.media_urls[0]} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} controls playsInline preload="metadata" />
                        </div>
                    ) : (
                        /* Standard image carousel */
                        <>
                            <img src={post.media_urls[carouselIdx]} alt="" style={{ maxWidth: '100%', display: 'block', margin: '0 auto', cursor: 'pointer' }}
                                onClick={() => setLightboxUrl(post.media_urls[carouselIdx])} />
                        </>
                    )}
                    {/* P10-1: Image heart animation overlay */}
                    {doubleTapHeart && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', animation: 'likePopAnim 0.8s ease-out forwards', zIndex: 10 }}>
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="#F02849" stroke="#F02849" strokeWidth="1">
                                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                            </svg>
                        </div>
                    )}
                    {post.media_urls.length > 1 && !isYouTubeUrl(post.media_urls[0]) && (
                        <>
                            {carouselIdx > 0 && (
                                <button onClick={() => setCarouselIdx(i => i - 1)} style={{
                                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                                    width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff',
                                    border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>‹</button>
                            )}
                            {carouselIdx < post.media_urls.length - 1 && (
                                <button onClick={() => setCarouselIdx(i => i + 1)} style={{
                                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                    width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff',
                                    border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>›</button>
                            )}
                            <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
                                {post.media_urls.map((_, di) => (
                                    <div key={di} onClick={() => setCarouselIdx(di)} style={{
                                        width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                                        background: di === carouselIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                                        border: '1px solid rgba(0,0,0,0.2)',
                                    }} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* P12-3: Image Lightbox */}
            {lightboxUrl && (
                <div onClick={() => setLightboxUrl(null)} style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
                }}>
                    <button onClick={() => setLightboxUrl(null)} style={{
                        position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer',
                        fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
                    }}>&times;</button>
                    <img src={lightboxUrl} alt="" style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 4 }} />
                </div>
            )}

            {/* Link Preview — upgraded to SharedLinkPreviewCard from social-media */}
            {post.link_preview && post.link_preview.url && (
                <div onClick={() => onOpenArticle?.({ open: true, url: post.link_preview.url, title: post.link_preview.title || 'Article' })} style={{ cursor: 'pointer' }}>
                    <SharedLinkPreviewCard url={post.link_preview.url} />
                </div>
            )}

            {/* Check-in venue badge (feature parity with social-media) */}
            {post.content && /^Checked in at /i.test(post.content) && (() => {
                const match = post.content.match(/^Checked in at (.+?)(?:\s*[—–]\s*(.+))?$/i);
                const venueName = match?.[1] || post.content.replace(/^Checked in at /i, '').split('—')[0].trim();
                const locationText = match?.[2]?.trim() || '';
                return (
                    <div style={{
                        margin: '0 16px 10px', padding: '12px 14px', borderRadius: 10,
                        background: 'linear-gradient(135deg, #E7F3FF 0%, #F0F7FF 100%)',
                        border: '1px solid #B8D4F0',
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1877F2' }}>{venueName}</div>
                            {locationText && <div style={{ fontSize: 11, color: '#65676B', marginTop: 1 }}>{locationText}</div>}
                        </div>
                    </div>
                );
            })()}

            {/* Stats — #14 Like animation + reaction breakdown + view count */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', fontSize: 13, color: C.textSec }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {likeAnim && <span style={{ display: 'inline-block', animation: 'likePopAnim 0.4s ease-out', color: '#E74C3C', fontSize: 16 }}>{'\u2764'}</span>}
                    {post.like_count > 0 && <span style={{ display: 'flex', gap: 1 }}>{['👍','❤️','😂'].slice(0, Math.min(3, post.like_count)).map((e,i) => <span key={i} style={{ fontSize: 14 }}>{e}</span>)}</span>}
                    {post.like_count || 0} {(post.like_count || 0) === 1 ? 'like' : 'likes'}
                </span>
                <span style={{ display: 'flex', gap: 12 }}>
                    {post.view_count > 0 && <span>{post.view_count > 999 ? (post.view_count / 1000).toFixed(1) + 'k' : post.view_count} view{post.view_count !== 1 ? 's' : ''}</span>}
                    <span>{post.comment_count || 0} {(post.comment_count || 0) === 1 ? 'comment' : 'comments'}</span>
                </span>
            </div>

            {/* Action Buttons — #13 debounce + #14 animation + P7-1 reactions */}
            <div style={{ display: 'flex', borderTop: `1px solid ${C.border}`, borderBottom: showComments ? `1px solid ${C.border}` : 'none', position: 'relative' }}>
                {/* P7-1 Reaction picker popup */}
                {showReactions && (
                    <div style={{
                        position: 'absolute', bottom: '100%', left: 4, background: C.card,
                        borderRadius: 28, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: `1px solid ${C.border}`,
                        padding: '6px 8px', display: 'flex', gap: 4, zIndex: 50,
                        animation: 'reactPopIn 0.2s ease-out',
                    }}
                    onMouseEnter={() => { clearTimeout(reactionTimer.current); setShowReactions(true); }}
                    onMouseLeave={() => { reactionTimer.current = setTimeout(() => setShowReactions(false), 300); }}
                    >
                        {[
                            { emoji: '\uD83D\uDC4D', label: 'Like' },
                            { emoji: '\u2764\uFE0F', label: 'Love' },
                            { emoji: '\uD83D\uDE02', label: 'Haha' },
                            { emoji: '\uD83D\uDE2E', label: 'Wow' },
                            { emoji: '\uD83D\uDE22', label: 'Sad' },
                            { emoji: '\uD83D\uDE21', label: 'Angry' },
                        ].map(r => (
                            <button key={r.label} title={r.label} onClick={() => {
                                if (isLikingRef.current) return;
                                isLikingRef.current = true;
                                setLikeAnim(true);
                                setTimeout(() => setLikeAnim(false), 500);
                                onLike(post.id, r.label.toLowerCase());
                                setTimeout(() => { isLikingRef.current = false; }, 800);
                                setShowReactions(false);
                            }} style={{
                                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer',
                                padding: '4px 6px', borderRadius: 12, transition: 'transform 0.15s',
                            }}
                            onMouseEnter={e => e.target.style.transform = 'scale(1.35)'}
                            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                            >{r.emoji}</button>
                        ))}
                    </div>
                )}
                {[
                    { label: post.user_liked ? 'Liked' : 'Like', action: () => {
                        if (isLikingRef.current) return;
                        isLikingRef.current = true;
                        setLikeAnim(true);
                        setTimeout(() => setLikeAnim(false), 500);
                        onLike(post.id);
                        setTimeout(() => { isLikingRef.current = false; }, 800);
                    }, active: post.user_liked, onMouseEnter: () => {
                        reactionTimer.current = setTimeout(() => setShowReactions(true), 500);
                    }, onMouseLeave: () => {
                        clearTimeout(reactionTimer.current);
                        reactionTimer.current = setTimeout(() => setShowReactions(false), 300);
                    },
                    // P8-8: Mobile long-press opens reaction picker
                    onTouchStart: () => {
                        longPressTimer.current = setTimeout(() => setShowReactions(true), 500);
                    },
                    onTouchEnd: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); },
                    },
                    { label: 'Comment', action: fetchComments, onMouseEnter: undefined, onMouseLeave: undefined, onTouchStart: undefined, onTouchEnd: undefined },
                    { label: 'Share', action: () => setShowShareModal(true), onMouseEnter: undefined, onMouseLeave: undefined, onTouchStart: undefined, onTouchEnd: undefined },
                    { label: bookmarked ? 'Saved' : 'Save', action: async () => {
                        if (!user || isSavingRef.current) return;
                        isSavingRef.current = true;
                        const newState = !bookmarked;
                        setBookmarked(newState);
                        try {
                            const token = getAccessToken();
                            const res = await fetch('/api/social/pages/engage', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ action: 'bookmark', post_id: post.id }),
                            });
                            const json = await res.json();
                            if (!json.success) { setBookmarked(!newState); toast.error('Could not save post'); }
                            else {
                                toast.success(newState ? 'Post saved' : 'Post unsaved');
                                eventBus.emit(EventType.SOCIAL_REACTION_UPDATE, { 
                                    postId: post.id, 
                                    userId: user.id, 
                                    action: newState ? 'add' : 'remove', 
                                    reactionType: 'bookmark' 
                                });
                            }
                        } catch { setBookmarked(!newState); toast.error('Could not save post'); }
                        finally { isSavingRef.current = false; }
                    }, active: bookmarked, onMouseEnter: undefined, onMouseLeave: undefined, onTouchStart: undefined, onTouchEnd: undefined },
                ].map((btn, i) => (
                    <button key={i} onClick={btn.action}
                        onMouseEnter={btn.onMouseEnter}
                        onMouseLeave={btn.onMouseLeave}
                        onTouchStart={btn.onTouchStart}
                        onTouchEnd={btn.onTouchEnd}
                        style={{
                        flex: 1, padding: '10px 0', border: 'none', background: 'none',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        color: btn.active ? C.blue : C.textSec, borderRight: i < 2 ? `1px solid ${C.border}` : 'none',
                    }}>{btn.label}</button>
                ))}
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onClick={() => setShowShareModal(false)}>
                    <div style={{ background: C.card, borderRadius: 16, maxWidth: 360, width: '100%', padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>Share Post</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* #5 Share to personal feed */}
                            {user && (
                                <button onClick={async () => {
                                    try {
                                        const token = getAccessToken();
                                        const shareRes = await fetch('/api/social/posts', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                            body: JSON.stringify({ content: `Shared from ${page?.name}: ${post.content?.slice(0, 200) || ''}\n\n${shareUrl}`, content_type: 'text' }),
                                        });
                                        if (!shareRes.ok) throw new Error('Share failed');
                                        setShowShareModal(false);
                                        busEmit.dataMutated('social');
                                    } catch (e) { console.warn('Share to feed error:', e); setShowShareModal(false); }
                                }} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                                    border: `1px solid ${C.border}`, background: '#E7F3FF', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: C.blue, fontFamily: 'inherit', width: '100%', textAlign: 'left',
                                }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                                    Share to My Feed
                                </button>
                            )}
                            <button onClick={() => { navigator.clipboard.writeText(shareUrl).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); setShowShareModal(false); }} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: C.text, fontFamily: 'inherit', width: '100%', textAlign: 'left',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                                Copy Link
                            </button>
                            <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.content?.slice(0, 100) || '')}`}
                                target="_blank" rel="noopener noreferrer" style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: C.text, textDecoration: 'none',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DA1F2"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>
                                Share on X
                            </a>
                            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                                target="_blank" rel="noopener noreferrer" style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: C.text, textDecoration: 'none',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
                                Share on Facebook
                            </a>
                            <a href={`https://wa.me/?text=${encodeURIComponent((post.content?.slice(0, 100) || 'Check this out') + ' ' + shareUrl)}`}
                                target="_blank" rel="noopener noreferrer" style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: C.text, textDecoration: 'none',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                Share on WhatsApp
                            </a>
                            <a href={`mailto:?subject=${encodeURIComponent(page?.name || 'Check this page')}&body=${encodeURIComponent(shareUrl)}`}
                                style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: C.text, textDecoration: 'none',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7"/></svg>
                                Share via Email
                            </a>
                            {/* P10-4: SMS share */}
                            <a href={`sms:?body=${encodeURIComponent((post.content?.slice(0, 80) || 'Check this out') + ' ' + shareUrl)}`}
                                style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: C.text, textDecoration: 'none',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                Share via SMS
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onClick={() => setConfirmDelete(false)}>
                    <div style={{ background: C.card, borderRadius: 12, padding: 24, maxWidth: 320, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>Delete This Post?</div>
                        <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>This post will be permanently removed. This action cannot be undone.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px 16px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 20, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                            <button onClick={() => { onDelete(post.id); setConfirmDelete(false); }} style={{ flex: 1, padding: '10px 16px', background: '#F02849', color: 'white', border: 'none', borderRadius: 20, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comments — #1 threading, #4 likes, #11 optimistic */}
            {showComments && (
                <div style={{ padding: '8px 16px 12px' }}>
                    {loadingComments ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[1, 2, 3].map(i => (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E4E6EB', flexShrink: 0, animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ width: '40%', height: 10, borderRadius: 4, background: '#E4E6EB', marginBottom: 6, animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                        <div style={{ width: '80%', height: 10, borderRadius: 4, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            {comments.filter(c => !c.parent_id).slice(0, commentDisplayLimit).map(c => (
                                <div key={c.id}>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                        <Avatar src={c.author?.avatar_url} name={c.author?.full_name} size={28} />
                                        <div style={{ flex: 1 }}>
                                            {/* P8-11: Inline comment edit */}
                                            {editingComment === c.id ? (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <input type="text" value={editCommentText} onChange={e => setEditCommentText(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter' && editCommentText.trim()) { const newContent = editCommentText.trim(); const oldContent = c.content; setComments(prev => prev.map(x => x.id === c.id ? { ...x, content: newContent } : x)); setEditingComment(null); (async () => { try { const token = getAccessToken(); const r = await fetch('/api/social/pages/engage', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ id: c.id, content: newContent }) }); if (!r.ok) throw new Error('Edit failed'); } catch(e) { setComments(prev => prev.map(x => x.id === c.id ? { ...x, content: oldContent } : x)); } })(); } if (e.key === 'Escape') setEditingComment(null); }}
                                                        autoFocus style={{ flex: 1, padding: '6px 10px', borderRadius: 12, border: `1px solid ${C.blue}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: C.bg }} />
                                                    <button onClick={() => setEditingComment(null)} style={{ background: 'none', border: 'none', fontSize: 11, color: C.textSec, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                <div style={{ background: C.bg, borderRadius: 12, padding: '8px 12px' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.author?.full_name || c.author?.username || 'Unknown'}</div>
                                                    <div style={{ fontSize: 13, color: C.text }}>{renderMentions(c.content)}</div>
                                                    {/* Phase 3: Comment media (GIF/image) display */}
                                                    {c.media_url && (
                                                        <div style={{ marginTop: 6 }}>
                                                            {(c.media_type === 'gif' || c.media_url?.includes('.gif')) ? (
                                                                <img src={c.media_url} alt="GIF" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                                                            ) : (
                                                                <img src={c.media_url} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, cursor: 'pointer' }} onClick={() => setLightboxUrl(c.media_url)} />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 12, padding: '2px 8px', fontSize: 11, color: C.textSec, alignItems: 'center' }}>
                                                <span>{timeAgo(c.created_at)}</span>
                                                {user && <button onClick={() => {
                                                    if (pendingCommentLikesRef.current.has(c.id)) return;
                                                    pendingCommentLikesRef.current.add(c.id);
                                                    
                                                    const wasLiked = c.user_liked_comment;
                                                    // Optimistic UI update
                                                    setComments(prev => prev.map(x => x.id === c.id ? { 
                                                        ...x, 
                                                        user_liked_comment: !wasLiked, 
                                                        comment_like_count: !wasLiked ? ((x.comment_like_count || 0) + 1) : Math.max(0, (x.comment_like_count || 1) - 1) 
                                                    } : x));

                                                    const token = getAccessToken();
                                                    fetch('/api/social/pages/engage', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                        body: JSON.stringify({ action: 'like_comment', post_id: post.id, comment_id: c.id }),
                                                    }).then(r => r.json()).then(j => {
                                                        if (!j.success) {
                                                            // Rollback
                                                            setComments(prev => prev.map(x => x.id === c.id ? { 
                                                                ...x, 
                                                                user_liked_comment: wasLiked, 
                                                                comment_like_count: wasLiked ? ((x.comment_like_count || 0) + 1) : Math.max(0, (x.comment_like_count || 1) - 1) 
                                                            } : x));
                                                        } else {
                                                            // Reconcile
                                                            setComments(prev => prev.map(x => x.id === c.id ? { 
                                                                ...x, 
                                                                user_liked_comment: j.liked, 
                                                                comment_like_count: j.liked && !wasLiked ? ((x.comment_like_count || 0) + 1) : !j.liked && wasLiked ? Math.max(0, (x.comment_like_count || 1) - 1) : x.comment_like_count 
                                                            } : x));
                                                            busEmit.dataMutated('social-pages');
                                                        }
                                                    }).catch(e => {
                                                        console.warn('[App] Handled promise rejection:', e?.message || e);
                                                        // Rollback
                                                        setComments(prev => prev.map(x => x.id === c.id ? { 
                                                            ...x, 
                                                            user_liked_comment: wasLiked, 
                                                            comment_like_count: wasLiked ? ((x.comment_like_count || 0) + 1) : Math.max(0, (x.comment_like_count || 1) - 1) 
                                                        } : x));
                                                    }).finally(() => {
                                                        setTimeout(() => {
                                                            pendingCommentLikesRef.current.delete(c.id);
                                                        }, 300);
                                                    });
                                                }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: c.user_liked_comment ? C.blue : C.textSec, fontSize: 11, padding: 0, fontFamily: 'inherit' }}>
                                                    {c.user_liked_comment ? 'Liked' : 'Like'}{c.comment_like_count > 0 ? ` (${c.comment_like_count})` : ''}
                                                </button>}
                                                {user && <button onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: C.textSec, fontSize: 11, padding: 0, fontFamily: 'inherit' }}>Reply</button>}
                                                {/* P8-1: Comment delete — server-first; UI update driven by SOCIAL_COMMENT_UPDATE event on success */}
                                                {user && (c.user_id === user.id || isPageOwner) && <button onClick={() => { if (onDeleteComment) onDeleteComment(post.id, c.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: '#FA383E', fontSize: 11, padding: 0, fontFamily: 'inherit' }}>Delete</button>}
                                                {/* P8-11: Comment edit */}
                                                {user && c.user_id === user.id && <button onClick={() => { setEditingComment(c.id); setEditCommentText(c.content || ''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: C.textSec, fontSize: 11, padding: 0, fontFamily: 'inherit' }}>Edit</button>}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Nested replies */}
                                    {comments.filter(r => r.parent_id === c.id).map(r => (
                                        <div key={r.id} style={{ display: 'flex', gap: 8, marginLeft: 36, marginBottom: 4, borderLeft: `2px solid ${C.border}`, paddingLeft: 8 }}>
                                            <Avatar src={r.author?.avatar_url} name={r.author?.full_name} size={24} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ background: C.bg, borderRadius: 12, padding: '6px 10px' }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.author?.full_name || r.author?.username || 'Unknown'}</div>
                                                    <div style={{ fontSize: 12, color: C.text }}>{renderMentions(r.content)}</div>
                                                    {r.media_url && (
                                                        <div style={{ marginTop: 4 }}>
                                                            <img src={r.media_url} alt="" style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 6 }} />
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: C.textSec, padding: '2px 8px' }}>
                                                    <span>{timeAgo(r.created_at)}</span>
                                                    {user && (r.user_id === user.id || isPageOwner) && <button onClick={() => { if (onDeleteComment) onDeleteComment(post.id, r.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: '#FA383E', fontSize: 10, padding: 0, fontFamily: 'inherit' }}>Delete</button>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {/* Reply input */}
                                    {replyTo === c.id && user && (
                                        <div style={{ display: 'flex', gap: 6, marginLeft: 36, marginBottom: 8, marginTop: 4 }}>
                                            <Avatar src={isOwnerOnOwnPage ? page?.avatar_url : user.user_metadata?.avatar_url} name={isOwnerOnOwnPage ? page?.name : user.user_metadata?.full_name} size={24} />
                                            <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                                                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && replyText.trim()) {
                                                            const tempReply = { id: `temp-${Date.now()}`, content: replyText.trim(), parent_id: c.id, created_at: new Date().toISOString(), author: { full_name: isOwnerOnOwnPage ? page?.name : user.user_metadata?.full_name, avatar_url: isOwnerOnOwnPage ? page?.avatar_url : user.user_metadata?.avatar_url } };
                                                            setComments(prev => [...prev, tempReply]);
                                                            const txt = replyText.trim(); setReplyText(''); setReplyTo(null);
                                                            (async () => { try { const token = getAccessToken(); const res = await fetch('/api/social/pages/engage', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'comment', post_id: post.id, user_id: user.id, content: txt, parent_id: c.id }) }); if (res.ok) { const json = await res.json(); if (json.success) { setComments(prev => prev.map(x => x.id === tempReply.id ? json.data : x)); onComment(post.id); eventBus.emit(EventType.SOCIAL_COMMENT_UPDATE, { postId: post.id, userId: user.id, action: 'add', comment: json.data }); } } else { setComments(prev => prev.filter(x => x.id !== tempReply.id)); } } catch(e) { setComments(prev => prev.filter(x => x.id !== tempReply.id)); } })();
                                                        }
                                                    }}
                                                    placeholder={`Reply to ${c.author?.full_name || 'comment'}...`}
                                                    style={{ flex: 1, padding: '6px 10px', borderRadius: 16, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: C.bg }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {/* #8: Show more comments */}
                            {comments.filter(c => !c.parent_id).length > commentDisplayLimit && (
                                <button onClick={() => setCommentDisplayLimit(prev => prev + 10)} style={{
                                    width: '100%', padding: '8px 0', background: 'none', border: 'none',
                                    fontSize: 13, fontWeight: 600, color: C.blue, cursor: 'pointer',
                                    fontFamily: 'inherit', marginBottom: 8,
                                }}>
                                    Show {Math.min(10, comments.filter(c => !c.parent_id).length - commentDisplayLimit)} more comment{comments.filter(c => !c.parent_id).length - commentDisplayLimit !== 1 ? 's' : ''}
                                </button>
                            )}
                            {/* Main comment input — #11 optimistic + Phase 3: GIF picker + media */}
                            {user && (
                                <div style={{ marginTop: 8 }}>
                                    {/* Phase 3: Comment media preview */}
                                    {commentMediaUrl && (
                                        <div style={{ position: 'relative', marginBottom: 6, display: 'inline-block' }}>
                                            <img src={commentMediaUrl} alt="" style={{ maxWidth: 200, maxHeight: 120, borderRadius: 8, border: `1px solid ${C.border}` }} />
                                            <button onClick={() => { setCommentMediaUrl(null); setCommentMediaType(null); }} style={{
                                                position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                                                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer',
                                                fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>&times;</button>
                                        </div>
                                    )}
                                    {/* Phase 3: Typing indicator */}
                                    {isTyping && (
                                        <div style={{ fontSize: 11, color: C.textSec, padding: '2px 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ display: 'flex', gap: 2 }}>
                                                {[0, 1, 2].map(i => <span key={i} style={{
                                                    width: 5, height: 5, borderRadius: '50%', background: C.textSec, display: 'inline-block',
                                                    animation: 'sp-bounce 1.4s infinite ease-in-out both', animationDelay: `${i * 0.16}s`,
                                                }} />)}
                                            </span>
                                            <span>typing...</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Avatar
                                            src={isOwnerOnOwnPage ? page?.avatar_url : user.user_metadata?.avatar_url}
                                            name={isOwnerOnOwnPage ? page?.name : (user.user_metadata?.full_name || user.email)}
                                            size={28}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <input type="text" value={commentText} onChange={e => {
                                                    setCommentText(e.target.value);
                                                    // Typing indicator visual feedback
                                                    if (e.target.value.trim()) {
                                                        setIsTyping(true);
                                                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                                        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
                                                    } else {
                                                        setIsTyping(false);
                                                    }
                                                }}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && (commentText.trim() || commentMediaUrl)) {
                                                            setIsTyping(false);
                                                            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                                            const tempComment = { id: `temp-${Date.now()}`, content: commentText.trim(), parent_id: null, created_at: new Date().toISOString(), media_url: commentMediaUrl, media_type: commentMediaType, author: { full_name: isOwnerOnOwnPage ? page?.name : user.user_metadata?.full_name, avatar_url: isOwnerOnOwnPage ? page?.avatar_url : user.user_metadata?.avatar_url } };
                                                            setComments(prev => [...prev, tempComment]);
                                                            const txt = commentText.trim(); const mUrl = commentMediaUrl; const mType = commentMediaType;
                                                            setCommentText(''); setCommentMediaUrl(null); setCommentMediaType(null); setShowGifPicker(false);
                                                            (async () => { try { const token = getAccessToken(); const res = await fetch('/api/social/pages/engage', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'comment', post_id: post.id, user_id: user.id, content: txt, media_url: mUrl, media_type: mType }) }); if (res.ok) { const json = await res.json(); if (json.success) { setComments(prev => prev.map(x => x.id === tempComment.id ? json.data : x)); onComment(post.id); eventBus.emit(EventType.SOCIAL_COMMENT_UPDATE, { postId: post.id, userId: user.id, action: 'add', comment: json.data }); } } else { setComments(prev => prev.filter(x => x.id !== tempComment.id)); } } catch(e) { setComments(prev => prev.filter(x => x.id !== tempComment.id)); } })();
                                                        }
                                                    }}
                                                    placeholder={isOwnerOnOwnPage ? `Comment as ${page?.name}...` : 'Write a comment...'}
                                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: C.bg }} />
                                                {/* Phase 3: GIF button */}
                                                <button onClick={() => setShowGifPicker(!showGifPicker)} style={{
                                                    padding: '6px 10px', borderRadius: 20, border: `1px solid ${C.border}`,
                                                    background: showGifPicker ? C.blue : 'transparent', color: showGifPicker ? '#fff' : C.textSec,
                                                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                                }}>GIF</button>
                                                <button onClick={() => {
                                                    if (!commentText.trim() && !commentMediaUrl) return;
                                                    setIsTyping(false);
                                                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                                    const tempComment = { id: `temp-${Date.now()}`, content: commentText.trim(), parent_id: null, created_at: new Date().toISOString(), media_url: commentMediaUrl, media_type: commentMediaType, author: { full_name: isOwnerOnOwnPage ? page?.name : user.user_metadata?.full_name, avatar_url: isOwnerOnOwnPage ? page?.avatar_url : user.user_metadata?.avatar_url } };
                                                    setComments(prev => [...prev, tempComment]);
                                                    const txt = commentText.trim(); const mUrl = commentMediaUrl; const mType = commentMediaType;
                                                    setCommentText(''); setCommentMediaUrl(null); setCommentMediaType(null); setShowGifPicker(false);
                                                    (async () => { try { const token = getAccessToken(); const res = await fetch('/api/social/pages/engage', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'comment', post_id: post.id, user_id: user.id, content: txt, media_url: mUrl, media_type: mType }) }); if (res.ok) { const json = await res.json(); if (json.success) { setComments(prev => prev.map(x => x.id === tempComment.id ? json.data : x)); onComment(post.id); eventBus.emit(EventType.SOCIAL_COMMENT_UPDATE, { postId: post.id, userId: user.id, action: 'add', comment: json.data }); } } else { setComments(prev => prev.filter(x => x.id !== tempComment.id)); } } catch(e) { setComments(prev => prev.filter(x => x.id !== tempComment.id)); } })();
                                                }} disabled={!commentText.trim() && !commentMediaUrl} style={{
                                                    padding: '6px 12px', borderRadius: 20, border: 'none',
                                                    background: (commentText.trim() || commentMediaUrl) ? C.blue : '#E4E6EB',
                                                    color: (commentText.trim() || commentMediaUrl) ? '#fff' : C.textSec,
                                                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}>Post</button>
                                            </div>
                                            {/* Phase 3: GIF Picker */}
                                            {showGifPicker && (
                                                <div style={{ marginTop: 6 }}>
                                                    <GiphyPicker
                                                        compact
                                                        onSelect={(gifUrl) => {
                                                            setCommentMediaUrl(gifUrl);
                                                            setCommentMediaType('gif');
                                                            setShowGifPicker(false);
                                                        }}
                                                        onClose={() => setShowGifPicker(false)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function SocialPageDetail() {
    // State hooks BEFORE useRouter — prevents SWC minifier TDZ collision
    // (SWC was naming both the function and its first let binding 'k')
    const [page, setPage] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { pageId } = router.query;
    const { user } = useAuthUser();
    useTrainingBus('social-page-detail');
    const { isClubMode, clubPage } = useActiveIdentity();
    const [posts, setPosts] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [activeTab, setActiveTab] = useState('posts');
    const [isFollowing, setIsFollowing] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [memberSearch, setMemberSearch] = useState('');
    // #10 Post visibility
    // #3 Load More pagination
    const [hasMorePosts, setHasMorePosts] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    // Invite friends
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteFriends, setInviteFriends] = useState([]);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [invitedIds, setInvitedIds] = useState(new Set());
    const [inviteSearch, setInviteSearch] = useState('');

    // Reviews (#1)
    const [reviews, setReviews] = useState([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [avgRating, setAvgRating] = useState(0);
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewTitle, setReviewTitle] = useState('');
    const [reviewContent, setReviewContent] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    // Phase 9: GoLive / LiveStream / CheckIn / ArticleReader state
    const [showGoLiveModal, setShowGoLiveModal] = useState(false);
    const [liveStreams, setLiveStreams] = useState([]);
    const [watchingStream, setWatchingStream] = useState(null);
    const [showCheckInModal, setShowCheckInModal] = useState(false);
    const [articleReader, setArticleReader] = useState({ open: false, url: null, title: null });
    const [posting, setPosting] = useState(false);

    // Live Games (#2)
    const [games, setGames] = useState([]);
    const [gamesLoading, setGamesLoading] = useState(false);
    const [seatAction, setSeatAction] = useState(null); // { gameId, type }
    // P8-5: Post sorting
    // #9: Post sort with localStorage persistence (hydration-safe: always init as 'recent')
    const [postSort, setPostSort] = useState('recent');
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sp_post_sort');
            if (saved && saved !== 'recent') setPostSort(saved);
        }
    }, []);
    const handleSetPostSort = (sort) => {
        setPostSort(sort);
        if (typeof window !== 'undefined') localStorage.setItem('sp_post_sort', sort);
    };

    // Report (#6)
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [reportDetails, setReportDetails] = useState('');
    const [submittingReport, setSubmittingReport] = useState(false);

    // Notification toggle (#7)
    const [notifyEnabled, setNotifyEnabled] = useState(false);
    const [togglingNotify, setTogglingNotify] = useState(false);

    // #1: Infinite scroll sentinel ref 
    const loadMoreSentinelRef = useRef(null);
    const loadMoreFetchRef = useRef(false); // debounce guard for #4

    // Media lightbox
    const [lightboxMedia, setLightboxMedia] = useState(null); // { list, index }

    // Venue check-ins (shown on venue-type pages)
    const [venueCheckins, setVenueCheckins] = useState([]);
    const [resolvedVenueId, setResolvedVenueId] = useState(null);
    const [checkinCount, setCheckinCount] = useState(0);
    // P9: Follow loading, cover/avatar upload
    const [followLoading, setFollowLoading] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const coverInputRef = useRef(null);
    const avatarInputRef = useRef(null);
    // #9: Milestone confetti state
    const [showMilestone, setShowMilestone] = useState(null);
    // #10: Suggested pages
    const [suggestedSidebarPages, setSuggestedSidebarPages] = useState([]);
    // P10-7: Scroll-to-top
    const [showScrollTop, setShowScrollTop] = useState(false);

    // Toast notification system
    const [toastMsg, setToastMsg] = useState(null);
    const toastTimerRef = useRef(null);
    const toast = {
        success: (msg, duration = 3000) => {
            setToastMsg({ text: msg, type: 'success' });
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setToastMsg(null), duration);
        },
        error: (msg, duration = 4000) => {
            setToastMsg({ text: msg, type: 'error' });
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setToastMsg(null), duration);
        }
    };

    // Cleanup toast timer on unmount
    useEffect(() => {
        return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
    }, []);

    // Owner identity detection — works regardless of active identity mode
    // userRole is already set by the API (detected via page.owner_id === user.id)
    const isPageOwner = userRole === 'owner';
    const isOwnerOnOwnPage = isPageOwner && !!page;

    // #10: Fetch suggested sidebar pages
    useEffect(() => {
        if (!user || !page || isPageOwner) { setSuggestedSidebarPages([]); return; }
        const fetchSugg = async () => {
            try {
                const p = new URLSearchParams({ limit: '5', user_id: user.id });
                if (page.page_type) p.set('page_type', page.page_type);
                const res = await fetch(`/api/social/pages?${p}`);
                const json = await res.json();
                if (json.success) {
                    setSuggestedSidebarPages(
                        (json.data || []).filter(sp => sp.id !== page.id && !sp.is_following).slice(0, 3)
                    );
                }
            } catch (e) { console.warn('[App] Handled exception:', e); }
        };
        fetchSugg();
    }, [user, page?.id, isPageOwner]);


    const fetchPage = useCallback(async (signal, { silent = false } = {}) => {
        if (!pageId) return;
        if (!silent) setLoading(true);
        try {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId);
            const userParam = user?.id ? `&user_id=${user.id}` : '';

            let json;
            if (isUUID) {
                const res = await fetch(`/api/social/pages?id=${pageId}${userParam}`, { signal });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                json = await res.json();
            } else {
                const res = await fetch(`/api/social/pages?slug=${pageId}${userParam}`, { signal });
                json = await res.json();

                // #4: Handle slug history redirect (old slug → new slug)
                if (json.success && json.redirect && json.new_slug) {
                    router.replace(`/hub/social-pages/${json.new_slug}`, undefined, { shallow: false });
                    return;
                }
                if (!res.ok && !json.success) throw new Error(`Request failed (${res.status})`);
            }

            if (json.success && json.data) {
                setPage(json.data);
                setIsFollowing(json.data.is_following || false);
                if (json.data.owner_id === user?.id) setUserRole('owner');

                // SEO: Redirect UUID URLs to slug URLs for canonical consolidation
                if (isUUID && json.data.slug && typeof window !== 'undefined') {
                    router.replace(`/hub/social-pages/${json.data.slug}`, undefined, { shallow: true });
                }
            }
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('Failed to fetch page:', e);
        }
        setLoading(false);
    }, [pageId, user]);

    const fetchPosts = useCallback(async (signal) => {
        if (!page?.id) return;
        try {
            const params = new URLSearchParams({ page_id: page.id, limit: '30' });
            const token = getAccessToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(`/api/social/pages/posts?${params}`, { signal, headers });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setPosts(json.data || []);
        } catch (e) { if (e.name !== 'AbortError') console.warn("[[pageId].js]", e); }
    }, [page, user]);

    const fetchFollowers = useCallback(async () => {
        if (!page?.id) return;
        try {
            const reqParam = user?.id ? `&requester_id=${user.id}` : '';
            const res = await fetch(`/api/social/pages/follow?page_id=${page.id}${reqParam}`);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setFollowers(json.data || []);
        } catch (e) { console.warn("[[pageId].js]", e); }
    }, [page, user]);

    useEffect(() => {
        const controller = new AbortController();
        fetchPage(controller.signal);
        return () => controller.abort();
    }, [fetchPage]);
    useEffect(() => {
        if (!page) return;
        const controller = new AbortController();
        fetchPosts(controller.signal);
        return () => controller.abort();
    }, [fetchPosts, page]);
    useEffect(() => { if (page && activeTab === 'members') fetchFollowers(); }, [fetchFollowers, page, activeTab]);

    // Fetch Reviews (#1) — MUST be declared before cross-tab sync effect
    const fetchReviews = useCallback(async () => {
        if (!page?.id) return;
        setReviewsLoading(true);
        try {
            const res = await fetch(`/api/social/pages/reviews?page_id=${page.id}`);
            const json = await res.json();
            if (json.success) {
                const revs = json.data?.reviews || [];
                setReviews(revs);
                if (revs.length > 0) {
                    const sum = revs.reduce((a, r) => a + (r.overall_rating || 0), 0);
                    setAvgRating(Math.round((sum / revs.length) * 10) / 10);
                } else setAvgRating(0);
            }
        } catch (e) { console.warn('Reviews fetch error:', e); }
        setReviewsLoading(false);
    }, [page]);
    useEffect(() => { if (page && activeTab === 'reviews') fetchReviews(); }, [fetchReviews, page, activeTab]);

    // #10: View count — already handled server-side via rpc('increment_page_views') on GET by slug

    // Fetch Games (#2) — MUST be declared before cross-tab sync effect
    const fetchGames = useCallback(async () => {
        if (!page?.id) return;
        setGamesLoading(true);
        try {
            const res = await fetch(`/api/social/pages/games?page_id=${page.id}`);
            const json = await res.json();
            if (json.success) setGames(json.data || []);
        } catch (e) { console.warn('Games fetch error:', e); }
        setGamesLoading(false);
    }, [page]);
    useEffect(() => { if (page && activeTab === 'games') fetchGames(); }, [fetchGames, page, activeTab]);

    // Cross-tab sync: refresh data when other tabs mutate social-pages
    useEffect(() => {
        const unsub = eventBus.on(EventType.DATA_MUTATED, (event) => {
            const entity = event?.payload?.entity;
            if (entity === 'social-pages' || entity === 'social') {
                fetchPosts();
                fetchFollowers();
                if (activeTab === 'reviews') fetchReviews();
                if (activeTab === 'games') fetchGames();
            }
        });
        return unsub;
    }, [fetchPosts, fetchFollowers, fetchReviews, fetchGames, activeTab]);

    // Tab from URL query (#deep linking)
    useEffect(() => {
        if (router.query.tab && ['posts','about','members','reviews','games','media','schedule'].includes(router.query.tab)) {
            setActiveTab(router.query.tab);
        }
    }, [router.query.tab]);

    const submitReview = async () => {
        if (!reviewRating || submittingReview) return;
        setSubmittingReview(true);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ page_id: page.id, overall_rating: reviewRating, title: reviewTitle, content: reviewContent }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                toast.success(json.updated ? 'Review updated!' : 'Review submitted!');
                setShowReviewForm(false);
                setReviewRating(0); setReviewTitle(''); setReviewContent('');
                fetchReviews();
                busEmit.dataMutated('social-pages');
            } else {
                throw new Error(json.error || 'Review submission failed');
            }
        } catch (e) {
            console.warn('Review submit error:', e);
            toast.error('Failed to submit review. Please try again.');
        }
        setSubmittingReview(false);
    };

    // Tournament schedule state (#F1 - Commander bridge)
    const [tournaments, setTournaments] = useState([]);
    const [tournamentsLoading, setTournamentsLoading] = useState(false);
    const [recentTournaments, setRecentTournaments] = useState([]);
    const fetchTournaments = useCallback(async () => {
        if (!page?.id) return;
        setTournamentsLoading(true);
        try {
            const res = await fetch(`/api/social/pages/schedule?page_id=${page.id}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    setTournaments(json.data || []);
                    setRecentTournaments(json.recent || []);
                }
            }
        } catch (e) { console.warn('Fetch tournaments error:', e); }
        setTournamentsLoading(false);
    }, [page?.id]);
    useEffect(() => { if (page && activeTab === 'schedule') fetchTournaments(); }, [fetchTournaments, page, activeTab]);

    // Fetch venue check-ins (resolves integer venue_id from page data)
    const fetchVenueCheckins = useCallback(async () => {
        if (!page?.name) return;
        try {
            let intVenueId = null;

            // Priority 1: Use linked_venue_id if the social page is linked to a poker venue
            if (page.linked_venue_id) {
                const parsed = parseInt(page.linked_venue_id, 10);
                if (!isNaN(parsed) && parsed > 0) intVenueId = parsed;
            }

            // Priority 2: Search venues API by page name, filter to integer-ID matches only
            if (!intVenueId) {
                const searchRes = await fetch(`/api/poker/venues?search=${encodeURIComponent(page.name)}&limit=5`);
                const searchData = await searchRes.json();
                const venues = (searchData?.data || []).filter(v => {
                    const numId = parseInt(v.id, 10);
                    return !isNaN(numId) && numId > 0;
                });
                const match = venues.find(v => v.name?.toLowerCase() === page.name?.toLowerCase()) || venues[0];
                if (match?.id) intVenueId = parseInt(match.id, 10);
            }

            if (!intVenueId) return; // No real poker venue found — skip silently
            setResolvedVenueId(intVenueId);

            // Fetch recent check-ins for this venue
            const checkinsRes = await fetch(`/api/poker/checkins?venue_id=${intVenueId}`);
            const checkinsData = await checkinsRes.json();
            if (checkinsData.success) {
                setVenueCheckins((checkinsData.checkins || []).slice(0, 5));
                setCheckinCount(checkinsData.count || 0);
            }
        } catch (e) { console.warn('Venue checkins fetch error:', e); }
    }, [page]);
    useEffect(() => { if (page && activeTab === 'posts') fetchVenueCheckins(); }, [fetchVenueCheckins, page, activeTab]);

    const handleSeatAction = async (gameId, actionType) => {
        if (seatAction) return;
        setSeatAction({ gameId, type: actionType });
        try {
            const token = getAccessToken();
            const playerName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Player';
            const res = await fetch('/api/social/pages/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ action: actionType === 'seat' ? 'take_seat' : 'join_waitlist', game_id: gameId, seat_number: actionType === 'seat' ? 1 : undefined, player_name: playerName }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(actionType === 'seat' ? 'Seat reserved!' : 'Added to waitlist!');
                fetchGames();
            } else {
                toast.error(json.error || 'Action failed');
            }
        } catch (e) {
            console.warn('Seat action error:', e);
            toast.error('Failed to join. Please try again.');
        }
        setSeatAction(null);
    };

    // Report (#6)
    const submitReport = async () => {
        if (!reportReason || submittingReport) return;
        setSubmittingReport(true);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ action: 'report', page_id: page.id, reason: reportReason, details: reportDetails }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Report failed');
            toast.success('Report submitted. Thank you.');
            setShowReportModal(false); setReportReason(''); setReportDetails('');
        } catch (e) {
            console.warn('Report error:', e);
            toast.error('Failed to submit report. Please try again.');
        }
        setSubmittingReport(false);
    };

    // Notification toggle (#7)
    const toggleNotifications = async () => {
        if (togglingNotify) return;
        setTogglingNotify(true);
        const newVal = !notifyEnabled;
        setNotifyEnabled(newVal); // optimistic
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/follow', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ page_id: page.id, notify: newVal }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.warn('Notification toggle error:', e);
            setNotifyEnabled(!newVal); // rollback on ANY error
            toast.error('Failed to update notification preference');
        }
        setTogglingNotify(false);
    };
  // Realtime subscription — live updates (posts, interactions, followers)
  useEffect(() => {

    if (!router.isReady) return;

    if (!pageId || !page) return;
    // Use resolved page.id UUID for realtime, not the raw URL param (which may be a slug)
    const resolvedId = page.id;
    const _ch = supabase
      .channel(`social-page:${resolvedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_posts', filter: `page_id=eq.${resolvedId}` }, () => {
        fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_post_likes' }, () => {
        fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_comment_likes' }, () => {
        fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_post_comments' }, () => {
        fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_reviews', filter: `page_id=eq.${resolvedId}` }, () => {
        fetchReviews();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_followers', filter: `page_id=eq.${resolvedId}` }, () => {
        fetchFollowers();
        // Refresh page data to get updated follower count (silent — no loading flash)
        fetchPage(undefined, { silent: true });
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [pageId, page, fetchPosts, fetchFollowers, fetchPage, fetchReviews]);

    // Phase 9: Fetch live streams for this page
    useEffect(() => {
        if (!page) return;
        LiveStreamService.getLiveStreams().then(streams => {
            // Filter to streams relevant to this page (if applicable)
            setLiveStreams(streams || []);
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }, [page]);

    // Phase 9: Cross-tab broadcastSync listener
    useEffect(() => {
        const cleanup = listenBroadcast('smarter_poker_social_sync', (payload) => {
            if (payload?.action === 'refresh_feed' && payload?.tabId !== BROADCAST_TAB_ID) {
                fetchPosts();
            }
        });
        return cleanup;
    }, [fetchPosts]);

    // #1: Infinite scroll observer
    useEffect(() => {
        if (!hasMorePosts || loadingMore || activeTab !== 'posts' || posts.length < 10) return;
        const sentinel = loadMoreSentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !loadMoreFetchRef.current && hasMorePosts) {
                loadMoreFetchRef.current = true;
                setLoadingMore(true);
                fetch(`/api/social/pages/posts?page_id=${page.id}&offset=${posts.length}&limit=10`, {
                    headers: (() => { const t = getAccessToken(); return t ? { 'Authorization': `Bearer ${t}` } : {}; })()
                })
                    .then(r => r.json())
                    .then(json => {
                        if (json.success && json.data?.length > 0) {
                            setPosts(prev => [...prev, ...json.data]);
                            if (json.data.length < 10) setHasMorePosts(false);
                        } else {
                            setHasMorePosts(false);
                        }
                    })
                    .catch(e => console.warn(e))
                    .finally(() => { setLoadingMore(false); loadMoreFetchRef.current = false; });
            }
        }, { rootMargin: '200px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMorePosts, loadingMore, activeTab, posts.length, page?.id, user?.id]);

    // P10-7: Scroll listener for scroll-to-top button
    useEffect(() => {
        const onScroll = () => setShowScrollTop(window.scrollY > 400);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const handleFollow = async () => {
        if (!user) { router.push('/auth/login'); return; }
        if (followLoading) return;
        setFollowLoading(true);
        const newState = !isFollowing;
        const prevCount = page?.follower_count || 0;
        setIsFollowing(newState);
        setPage(prev => prev ? {
            ...prev,
            follower_count: newState ? (prev.follower_count || 0) + 1 : Math.max(0, (prev.follower_count || 1) - 1)
        } : prev);

        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/follow', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    page_id: page.id, user_id: user.id,
                    action: newState ? 'follow' : 'unfollow',
                }),
            });
            if (!res.ok) throw new Error('Follow failed');
            toast.success(newState ? 'Following!' : 'Unfollowed');
            busEmit.dataMutated('social-pages');
            fetchFollowers();

            // #9: Follower milestone toast
            if (newState && isPageOwner) {
                const newCount = (page?.follower_count || 0) + 1;
                const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
                const hit = milestones.find(m => newCount === m);
                if (hit) {
                    setShowMilestone(hit);
                    setTimeout(() => setShowMilestone(null), 5000);
                }
            }
        } catch (e) {
            console.warn("[[pageId].js]", e);
            // Rollback optimistic update
            setIsFollowing(!newState);
            setPage(prev => prev ? { ...prev, follower_count: prevCount } : prev);
        }
        setFollowLoading(false);
    };

    const handlePostSubmit = async (postContent, urls, type, mentions, linkPreview, visibility, thumbnailUrl = null) => {
        if ((!postContent.trim() && urls.length === 0) || !user || !page) return false;
        if (posting) return false;
        setPosting(true);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    page_id: page.id,
                    author_id: user.id,
                    content: postContent.trim(),
                    content_type: urls.length > 0 ? 'media' : 'text',
                    visibility: visibility,
                    post_type: 'regular',
                    // AUDIT-4 FIX (2026-04-30): SharedPostCreator passes
                    // thumbnailUrl as the 7th onPost arg, plus linkPreview as
                    // the 5th. Both were silently dropped by this composer's
                    // handlePostSubmit — only fileless URLs got through. The
                    // /api/social/pages/posts handler accepts both fields
                    // already, so just forward them.
                    ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
                    ...(linkPreview ? { link_preview: linkPreview } : {}),
                    ...(urls.length > 0 ? { media_urls: urls } : {}),
                    ...(mentions && mentions.length > 0 ? { mentions } : {}) // Pass mentions if needed by API
                }),
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) {
                toast.success('Posted successfully!');
                busEmit.dataMutated('social-pages');
                busEmit.dataMutated('social');
                busEmit.socialPostCreated(json.data?.id || 'unknown', user.id);
                broadcastSync('smarter_poker_social_sync', { action: 'refresh_feed', tabId: BROADCAST_TAB_ID });
                fetchPosts();
                setPosting(false);
                return true;
            }
        } catch (e) {
            console.warn("[[pageId].js]", e);
            toast.error('Post failed — try again');
        }
        setPosting(false);
        return false;
    };

    const pendingLikesRef = useRef(new Set());

    const handleLike = async (postId, reactionType) => {
        if (!user) return;
        if (pendingLikesRef.current.has(postId)) return;
        pendingLikesRef.current.add(postId);

        const prevPosts = posts;
        const targetPost = posts.find(p => p.id === postId);
        const wasLiked = targetPost?.user_liked;
        // If changing reaction type on already-liked post, don't toggle — API updates type
        const isReactionChange = wasLiked && reactionType && reactionType !== 'like';
        if (!isReactionChange) {
            setPosts(prev => prev.map(p =>
                p.id === postId ? {
                    ...p,
                    user_liked: !p.user_liked,
                    like_count: p.user_liked ? Math.max(0, (p.like_count || 1) - 1) : (p.like_count || 0) + 1
                } : p
            ));
        }
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/engage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'like', post_id: postId, user_id: user.id, ...(reactionType ? { reaction_type: reactionType } : {}) }),
            });
            if (!res.ok) throw new Error('Like failed');
            
            const json = await res.json();
            if (json.success) {
                // Reconcile optimistic state with server truth to fix desyncs (e.g. changing reaction type via main Like button)
                setPosts(prev => prev.map(p => {
                    if (p.id !== postId) return p;
                    let newLikeCount = p.like_count || 0;
                    if (!isReactionChange) {
                        if (json.liked && !p.user_liked) newLikeCount += 1;
                        if (!json.liked && p.user_liked) newLikeCount = Math.max(0, newLikeCount - 1);
                    }
                    return {
                        ...p,
                        user_liked: json.liked,
                        like_count: newLikeCount
                    };
                }));
            }

            busEmit.dataMutated('social-pages');
            busEmit.socialPostLiked(postId, user.id, { added: json.success ? json.liked : !wasLiked });
            // Phase 4: Broadcast real-time reaction update via EventBus
            eventBus.emit(EventType.SOCIAL_REACTION_UPDATE, { 
                postId, 
                userId: user.id, 
                action: (json.success ? json.liked : !wasLiked) ? 'add' : 'remove', 
                reactionType: (json.success && json.reaction_type) ? json.reaction_type : (reactionType || 'like') 
            });
        } catch (e) {
            console.warn("[[pageId].js]", e);
            // Rollback optimistic update
            setPosts(prevPosts);
        } finally {
            // Unblock
            setTimeout(() => {
                pendingLikesRef.current.delete(postId);
            }, 300);
        }
    };

    const handleDeletePost = async (postId) => {
        const prevPosts = posts;
        setPosts(prev => prev.filter(p => p.id !== postId));
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/social/pages/posts?id=${postId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Delete failed');
            busEmit.dataMutated('social-pages');
            toast.success('Post deleted');
            // Phase 4: Broadcast real-time removal
            eventBus.emit(EventType.SOCIAL_POST_DELETED, { id: postId });
        } catch (e) {
            console.warn(e);
            toast.error('Failed to delete post');
            setPosts(prevPosts);
        }
    };

    // P8-1: Delete comment handler (calls engage.js DELETE)
    const handleDeleteComment = async (postId, commentId) => {
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/social/pages/engage?id=${commentId}&type=comment`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || `HTTP ${res.status}`);
            }
            // Only decrement after confirmed success
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) - 1) } : p));
            busEmit.dataMutated('social-pages');
            
            // Phase 4: Broadcast real-time comment removal via EventBus (cross-tab via BroadcastChannel)
            eventBus.emit(EventType.SOCIAL_COMMENT_UPDATE, { postId, commentId, action: 'remove' });
            
        } catch (e) {
            console.warn('Delete comment error:', e);
            toast.error('Failed to delete comment');
        }
    };

    // P8-15: Allow up to 3 pinned posts (not just 1)
    const handlePinPost = async (postId, pinned) => {
        const prevPosts = posts;
        if (pinned) {
            // Pinning — check if already at limit of 3
            const pinnedCount = posts.filter(p => p.is_pinned).length;
            if (pinnedCount >= 3) {
                toast.error('Maximum 3 pinned posts allowed');
                return;
            }
        }
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: pinned } : p));
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ id: postId, is_pinned: pinned }),
            });
            if (!res.ok) throw new Error('Pin failed');
            busEmit.dataMutated('social-pages');
            toast.success(pinned ? 'Post pinned' : 'Post unpinned');
        } catch (e) {
            console.warn(e);
            toast.error('Failed to update pin');
            setPosts(prevPosts); // Rollback
        }
    };

    const handleEditPost = (postId, newContent) => {
        setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, content: newContent, _edited: true } : p
        ));
        busEmit.dataMutated('social-pages');
    };

    // Follow/unfollow a user from the member list
    const [followingUsers, setFollowingUsers] = useState(new Set());
    const handleFollowUser = async (targetUserId) => {
        if (!user || targetUserId === user.id) return;
        const isCurrentlyFollowing = followingUsers.has(targetUserId);
        setFollowingUsers(prev => {
            const next = new Set(prev);
            isCurrentlyFollowing ? next.delete(targetUserId) : next.add(targetUserId);
            return next;
        });
        try {
            const token = getAccessToken();
            await fetch('/api/friends', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    action: isCurrentlyFollowing ? 'remove' : 'add',
                    target_user_id: targetUserId,
                }),
            });
            busEmit.dataMutated('friends');
        } catch (e) {
            console.warn('Follow user error:', e);
            // Rollback optimistic UI on failure
            setFollowingUsers(prev => {
                const next = new Set(prev);
                isCurrentlyFollowing ? next.add(targetUserId) : next.delete(targetUserId);
                return next;
            });
        }
    };

    const handleCommentAdded = (postId) => {
        setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
        ));
        // Phase 5 Crash Fix: Removed invalid busEmit.socialCommentAdded call that was crashing the app.
        // EventBus synchronization is now handled directly by the component EventListeners.
        busEmit.dataMutated('social-pages');
    };

    if (loading) {
        return (
            <>
                <UniversalHeader pageDepth={2} />
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg, padding: '76px 16px 80px', fontFamily: "var(--font-inter), -apple-system, sans-serif", maxWidth: 700, margin: '0 auto' }}>
                    <SkeletonLight variant="profile" />
                    <SkeletonLight variant="feed" rows={2} />
                </div>
            </>
        );
    }

    if (!page) {
        return (
            <>
                <UniversalHeader pageDepth={2} />
                <div style={{
                    minHeight: '100vh', background: C.bg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', paddingTop: 60,
                    fontFamily: "var(--font-inter), -apple-system, sans-serif",
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Page Not Found</h2>
                        <p style={{ color: C.textSec }}>This Page May Have Been Removed Or The Link Is Incorrect.</p>
                        <button onClick={() => router.push('/hub/social-pages')} style={{
                            marginTop: 16, padding: '10px 24px', background: C.blue, border: 'none',
                            borderRadius: 20, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}>
                            Browse Pages
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const typeColors = { venue: C.blue, group: C.green, community: '#8b5cf6', brand: '#F5A623' };
    const pageColor = typeColors[page.page_type || 'venue'] || C.blue;

    return (
        <>
            <SEOHead
                title={page.name}
                description={page.description || `Follow ${page.name} on Smarter.Poker`}
                ogImage={page.avatar_url || page.cover_url}
                canonical={`/hub/social-pages/${page.slug || page.id}`}
                jsonLd={{
                    '@type': 'Organization',
                    name: page.name,
                    description: page.description || `${page.name} on Smarter.Poker`,
                    url: `https://smarter.poker/hub/social-pages/${page.slug || page.id}`,
                    ...(page.avatar_url ? { logo: page.avatar_url } : {}),
                }}
            />
            <UniversalHeader pageDepth={2} />

            <div style={{
                minHeight: '100vh', background: C.bg, paddingBottom: 72,
                fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
            }}>
                {/* Cover */}
                <div style={{
                    height: 200, background: page.cover_url
                        ? `url(${page.cover_url}) center/cover` : `linear-gradient(135deg, ${pageColor}, #8b5cf6)`,
                    paddingTop: 56, position: 'relative',
                }}>
                    {/* P9-1: Cover photo upload */}
                    {isPageOwner && (
                        <>
                            <input type="file" ref={coverInputRef} accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingCover(true);
                                try {
                                    const _cToken = getAccessToken();
                                    const _cMime = file.type.startsWith('image/') ? file.type.split(';')[0] : 'image/jpeg';
                                    const _cMeta = await fetch('/api/social/upload-url', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', ..._cToken ? { Authorization: `Bearer ${_cToken}` } : {} },
                                        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: _cMime, folder: 'social-pages', prefix: page.id }),
                                    });
                                    if (!_cMeta.ok) throw new Error(`Upload auth failed (${_cMeta.status})`);
                                    const _cJson = await _cMeta.json();
                                    if (!_cJson.success) throw new Error(_cJson.error || 'Upload URL failed');
                                    const _cPut = await fetch(_cJson.signedUrl, { method: 'PUT', headers: { 'Content-Type': _cMime }, body: file });
                                    if (!_cPut.ok) throw new Error('Upload failed');
                                    const publicUrl = _cJson.publicUrl;
                                    await fetch('/api/social/pages', {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_cToken}` },
                                        body: JSON.stringify({ id: page.id, cover_url: publicUrl }),
                                    });
                                    setPage(prev => ({ ...prev, cover_url: publicUrl }));
                                    toast.success('Cover photo updated!');
                                    busEmit.dataMutated('social-pages');
                                } catch (err) { console.warn(err); toast.error('Cover upload failed'); }
                                setUploadingCover(false);
                                e.target.value = '';
                            }} />
                            <button onClick={() => coverInputRef.current?.click()} disabled={uploadingCover} style={{
                                position: 'absolute', bottom: 12, right: 12, padding: '6px 14px', borderRadius: 8,
                                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 12,
                                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)',
                                display: 'flex', alignItems: 'center', gap: 4,
                                opacity: uploadingCover ? 0.6 : 1,
                            }}>
                                {uploadingCover ? (
                                    <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                                    </svg>
                                )}
                                {uploadingCover ? 'Uploading...' : 'Edit Cover'}
                            </button>
                        </>
                    )}
                </div>

                {/* Page Info Header */}
                <div style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px' }}>
                        {/* Avatar and name */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: -65 }}>
                            {/* P9-2: Avatar upload for owners */}
                            <div style={{ position: 'relative', cursor: isPageOwner ? 'pointer' : 'default' }}
                                onClick={() => isPageOwner && avatarInputRef.current?.click()}>
                                {isPageOwner && (
                                    <input type="file" ref={avatarInputRef} accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        setUploadingAvatar(true);
                                        try {
                                            const _aToken = getAccessToken();
                                            const _aMime = file.type.startsWith('image/') ? file.type.split(';')[0] : 'image/jpeg';
                                            const _aMeta = await fetch('/api/social/upload-url', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', ..._aToken ? { Authorization: `Bearer ${_aToken}` } : {} },
                                                body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: _aMime, folder: 'social-pages', prefix: page.id }),
                                            });
                                            if (!_aMeta.ok) throw new Error(`Upload auth failed (${_aMeta.status})`);
                                            const _aJson = await _aMeta.json();
                                            if (!_aJson.success) throw new Error(_aJson.error || 'Upload URL failed');
                                            const _aPut = await fetch(_aJson.signedUrl, { method: 'PUT', headers: { 'Content-Type': _aMime }, body: file });
                                            if (!_aPut.ok) throw new Error('Upload failed');
                                            const publicUrl = _aJson.publicUrl;
                                            await fetch('/api/social/pages', {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_aToken}` },
                                                body: JSON.stringify({ id: page.id, avatar_url: publicUrl }),
                                            });
                                            setPage(prev => ({ ...prev, avatar_url: publicUrl }));
                                            toast.success('Avatar updated!');
                                            busEmit.dataMutated('social-pages');
                                        } catch (err) { console.warn(err); toast.error('Avatar upload failed'); }
                                        setUploadingAvatar(false);
                                        e.target.value = '';
                                    }} />
                                )}
                                <div style={{
                                    width: 130, height: 130, borderRadius: '50%', border: `4px solid ${C.card}`,
                                    background: page.avatar_url ? `url(${page.avatar_url}) center/cover` : pageColor,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 800, fontSize: 44, flexShrink: 0,
                                    position: 'relative', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                                }}>
                                {!page.avatar_url && page.name[0].toUpperCase()}
                                {/* P9-2: Camera overlay for owners */}
                                {isPageOwner && (
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        background: 'rgba(0,0,0,0.5)', padding: '3px 0',
                                        display: 'flex', justifyContent: 'center',
                                    }}>
                                        {uploadingAvatar ? (
                                            <div style={{ width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                                                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
                                            </svg>
                                        )}
                                    </div>
                                )}
                            </div>
                            </div>
                            <div style={{ paddingBottom: 8, flex: 1, minWidth: 0 }}>
                                <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.2 }}>
                                    {page.name}
                                    {page.is_verified && (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue} style={{ flexShrink: 0 }}>
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                    )}
                                </h1>
                                <p style={{ fontSize: 15, color: C.textSec, margin: '4px 0 0' }}>
                                    {(page.page_type || 'page').charAt(0).toUpperCase() + (page.page_type || 'page').slice(1)}
                                    {page.category && page.category !== 'general' && ` - ${page.category}`}
                                    {' '} - {page.follower_count || 0} Followers
                                </p>
                                {page.slug && (
                                    <p style={{ fontSize: 13, color: C.blue, margin: '4px 0 0', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                        </svg>
                                        smarter.poker/.../{ page.slug }
                                        {/* P9-10: Copy page URL button */}
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            const url = `${window.location.origin}/hub/social-pages/${page.slug || page.id}`;
                                            navigator.clipboard.writeText(url).then(() => toast.success('Link copied!')).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                        }} title="Copy page URL" style={{
                                            border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px',
                                            display: 'inline-flex', alignItems: 'center', borderRadius: 4,
                                        }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2">
                                                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                            </svg>
                                        </button>
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Description */}
                        {page.description && (
                            <p style={{ fontSize: 16, color: C.text, margin: '12px 0 0', lineHeight: 1.6, fontWeight: 400 }}>
                                {page.description}
                            </p>
                        )}

                        {/* Incomplete Page Banner — owner-only nudge when profile is missing key info */}
                        {userRole === 'owner' && (() => {
                            const missing = [];
                            if (!page.avatar_url) missing.push('Logo');
                            if (!page.cover_url) missing.push('Cover Photo');
                            if (!page.description?.trim()) missing.push('Description');
                            if (missing.length === 0) return null;
                            return (
                                <div style={{
                                    background: 'linear-gradient(135deg, #FFF7ED, #FFFBF0)',
                                    border: '1.5px solid #F59E0B',
                                    borderRadius: 12, padding: '12px 16px',
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    marginBottom: 4, flexWrap: 'wrap',
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" style={{ flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#92400E' }}>Finish Your Page Setup</p>
                                        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#B45309' }}>Missing: {missing.join(', ')}</p>
                                    </div>
                                    <button
                                        id="btn-finish-page-setup"
                                        onClick={() => router.push(`/hub/social-pages/${pageId}/manage`)}
                                        style={{
                                            padding: '7px 16px', borderRadius: 8, border: 'none',
                                            background: '#F59E0B', color: '#fff', fontSize: 13,
                                            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                            whiteSpace: 'nowrap', flexShrink: 0,
                                        }}
                                    >
                                        Complete Setup
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
                            {/* Edit Page — owner primary action, shown FIRST and prominently */}
                            {userRole === 'owner' && (
                                <button
                                    id="btn-edit-page"
                                    onClick={() => router.push(`/hub/social-pages/${pageId}/manage`)}
                                    style={{
                                        padding: '10px 22px', borderRadius: 10, border: 'none',
                                        background: C.blue, color: '#fff', fontSize: 15,
                                        fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                        display: 'flex', alignItems: 'center', gap: 7,
                                        boxShadow: '0 2px 8px rgba(24,119,242,0.25)',
                                    }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    Edit Page
                                </button>
                            )}
                            <button onClick={handleFollow} aria-label={isFollowing ? 'Unfollow this page' : 'Follow this page'} style={{
                                padding: '10px 24px', borderRadius: 10, border: 'none', fontSize: 15,
                                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                background: isFollowing ? '#E4E6EB' : (userRole === 'owner' ? '#E4E6EB' : C.blue),
                                color: isFollowing ? C.text : (userRole === 'owner' ? C.text : '#fff'),
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                {followLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                        {isFollowing ? 'Following' : 'Follow'}
                                    </div>
                                ) : (
                                    isFollowing ? 'Following' : 'Follow'
                                )}
                            </button>
                            {isFollowing && (
                                <button aria-label="Toggle notifications" onClick={async () => {
                                    setTogglingNotify(true);
                                    try {
                                        const token = getAccessToken();
                                        const res = await fetch('/api/social/pages/follow', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                            body: JSON.stringify({ page_id: page.id, notify: !notifyEnabled }),
                                        });
                                        if (res.ok) { setNotifyEnabled(!notifyEnabled); toast.success(notifyEnabled ? 'Notifications off' : 'Notifications on'); }
                                    } catch (e) { console.warn(e); }
                                    setTogglingNotify(false);
                                }} disabled={togglingNotify} title={notifyEnabled ? 'Notifications on' : 'Notifications off'} style={{
                                    padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
                                    background: notifyEnabled ? '#E7F3FF' : '#E4E6EB',
                                    cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center',
                                }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill={notifyEnabled ? C.blue : 'none'} stroke={notifyEnabled ? C.blue : C.textSec} strokeWidth="2">
                                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                    </svg>
                                </button>
                            )}
                            <button onClick={() => toast.success('Messaging coming soon!')} style={{
                                padding: '10px 18px', borderRadius: 10, border: `1px solid ${C.border}`,
                                background: '#E4E6EB', color: C.text, fontSize: 14,
                                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                Message
                            </button>
                        </div>

                        {/* Social Actions — Secondary Row */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                            {isPageOwner && (
                                <button onClick={() => setShowGoLiveModal(true)} style={{
                                    padding: '8px 16px', borderRadius: 20, border: 'none',
                                    background: 'linear-gradient(135deg, #FF4444, #FF0080)',
                                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                                    boxShadow: '0 2px 8px rgba(255,0,128,0.3)',
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/></svg>
                                    Go Live
                                </button>
                            )}
                                <button onClick={() => toast.success('Video calling coming soon!')} aria-label="Start video call" style={{
                                padding: '8px 16px', borderRadius: 20, border: `1px solid ${C.border}`,
                                background: C.bg, color: C.text, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                                Video
                            </button>
                            <button onClick={() => toast.success('Voice calling coming soon!')} aria-label="Start voice call" style={{
                                padding: '8px 16px', borderRadius: 20, border: `1px solid ${C.border}`,
                                background: C.bg, color: C.text, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.56.26 1.1.44 1.63a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.53.18 1.07.32 1.63.44A2 2 0 0122 16.92z"/></svg>
                                Call
                            </button>
                            <button onClick={() => { if (!user) { router.push('/auth/login'); return; } imageInputRef.current?.click(); }} aria-label="Upload photo or video" style={{
                                padding: '8px 16px', borderRadius: 20, border: `1px solid ${C.border}`,
                                background: C.bg, color: C.text, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                                Photo/Video
                            </button>
                            <button onClick={() => setShowReportModal(true)} aria-label="Report this page" style={{
                                padding: '8px 16px', borderRadius: 20, border: `1px solid ${C.border}`,
                                background: C.bg, color: C.textSec, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                                Report
                            </button>
                            <button onClick={() => { if (!user) { router.push('/auth/login'); return; } setShowCheckInModal(true); }} aria-label="Check in at this venue" style={{
                                padding: '8px 16px', borderRadius: 20, border: `1px solid ${C.border}`,
                                background: C.bg, color: C.text, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                Check In
                            </button>
                        </div>

                        {/* Mobile Action Bar (hidden on desktop where sidebar has these widgets) */}
                        <div className="mobile-action-bar" style={{
                            display: 'none', alignItems: 'center', gap: 6,
                            padding: '10px 0', borderTop: `1px solid ${C.border}`,
                        }}>
                            <button onClick={() => {
                                const url = `${window.location.origin}/hub/social-pages/${page.slug || page.id}`;
                                navigator.clipboard.writeText(url).then(() => toast.success('Link copied!')).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                            }} style={{
                                flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${C.border}`,
                                background: C.bg, fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', color: C.text,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                                Share
                            </button>
                            {user && (
                                <button onClick={async () => {
                                    setShowInviteModal(true);
                                    if (inviteFriends.length === 0) {
                                        setInviteLoading(true);
                                        try {
                                            const token = getAccessToken();
                                            const res = await fetch(`/api/friends?action=list`, { headers: { 'Authorization': `Bearer ${token}` } });
                                            const json = await res.json();
                                            if (json.success && json.data?.friends) {
                                                const followerIds = new Set(followers.map(f => f.user_id || f.profile?.id));
                                                setInviteFriends(json.data.friends.filter(f => !followerIds.has(f.id)));
                                            }
                                        } catch (e) { console.warn(e); }
                                        setInviteLoading(false);
                                    }
                                }} style={{
                                    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                                    background: '#E7F3FF', color: C.blue, fontSize: 12, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0114 0v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
                                    Invite
                                </button>
                            )}
                        </div>
                        {/* P9-3: Sticky tab bar */}
                        <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${C.border}`, position: 'sticky', top: 56, zIndex: 20, background: C.card, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            {['posts', 'about', 'members', 'reviews', 'games', 'schedule', 'media'].map(t => {
                                // P9-8 + P10-3: Tab count badges
                                const allMedia = posts.flatMap(p => (p.media_urls || []));
                                const badge = t === 'posts' ? posts.length
                                    : t === 'members' ? (page?.follower_count || 0)
                                    : t === 'reviews' ? reviews.length
                                    : t === 'media' ? allMedia.length
                                    : null;
                                return (
                                    <button key={t} onClick={() => setActiveTab(t)} style={{
                                        padding: '12px 16px', border: 'none', background: 'none',
                                        fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                        color: activeTab === t ? C.blue : C.textSec,
                                        borderBottom: `3px solid ${activeTab === t ? C.blue : 'transparent'}`,
                                        textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                                    }}>
                                        {t}{badge > 0 ? ` (${badge})` : ''}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
                        {/* Main Content */}
                        <div style={{ minWidth: 0 }}>
                            {activeTab === 'posts' && (
                                <>
                                    {/* #8: Pinned Posts Highlight Strip */}
                                    {(() => {
                                        const pinnedPosts = posts.filter(p => p.is_pinned);
                                        if (pinnedPosts.length === 0) return null;
                                        return (
                                            <div style={{ marginBottom: 14 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2">
                                                        <path d="M12 17v5" /><path d="M9 10.76a2 2 0 01-1 1.73V15h6v-2.51a2 2 0 01-1-1.73V4a2 2 0 00-4 0v6.76z" />
                                                    </svg>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Pinned</span>
                                                </div>
                                                <div style={{
                                                    display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6,
                                                    WebkitOverflowScrolling: 'touch',
                                                }}>
                                                    {pinnedPosts.map(pp => (
                                                        <div key={pp.id} onClick={() => {
                                                            const el = document.getElementById(`post-${pp.id}`);
                                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }} style={{
                                                            flexShrink: 0, width: 220, padding: '10px 12px',
                                                            background: '#FFFBF0', borderRadius: 10,
                                                            border: '1px solid #F5D78E', cursor: 'pointer',
                                                            transition: 'transform 0.15s',
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                                        >
                                                            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                                                                {pp.content || 'Pinned post'}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: C.textSec }}>
                                                                <span>{pp.like_count || 0} likes</span>
                                                                <span>{pp.comment_count || 0} comments</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {/* Create Post */}
                                    {user && (isFollowing || userRole === 'owner') && (
                                        <div style={{ paddingBottom: 16 }}>
                                            <SharedPostCreator
                                                user={user}
                                                authorOverride={isOwnerOnOwnPage ? {
                                                    id: page.id,
                                                    name: page.name,
                                                    avatar_url: page.avatar_url,
                                                    type: 'page'
                                                } : null}
                                                onPost={handlePostSubmit}
                                                isPosting={posting}
                                                context="social-pages"
                                            />
                                        </div>
                                    )}

                                    {/* Phase 9: Live Streams Section */}
                                    {liveStreams.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <h4 style={{ margin: '0 0 10px 4px', fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" fill="#FF0000"/></svg>
                                                Live Now
                                            </h4>
                                            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                                                {liveStreams.map(stream => (
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

                                    {/* Recently Checked In */}
                                    {venueCheckins.length > 0 && (
                                        <div style={{
                                            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                                            padding: 16, marginBottom: 16,
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="2">
                                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                                                        <circle cx="12" cy="10" r="3" />
                                                    </svg>
                                                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Recently Checked In</span>
                                                </div>
                                                {checkinCount > 0 && (
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: 12,
                                                        background: '#FFF3E0', color: '#E65100',
                                                        fontSize: 12, fontWeight: 700,
                                                    }}>
                                                        {checkinCount} today
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {venueCheckins.map(ci => (
                                                    <div key={ci.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '6px 12px', borderRadius: 20,
                                                        background: '#F0F2F5', fontSize: 13,
                                                    }}>
                                                        <div style={{
                                                            width: 24, height: 24, borderRadius: '50%',
                                                            background: C.blue, color: '#fff',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: 11, fontWeight: 700, flexShrink: 0,
                                                        }}>
                                                            {(ci.user_name || '?')[0].toUpperCase()}
                                                        </div>
                                                        <span style={{ fontWeight: 600, color: C.text }}>{ci.user_name}</span>
                                                        <span style={{ color: C.textSec, fontSize: 11 }}>{timeAgo(ci.created_at)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* P8-5: Post sort toggle */}
                                    {posts.length > 1 && (
                                        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                                            {[{ key: 'recent', label: 'Most Recent' }, { key: 'top', label: 'Top Posts' }].map(s => (
                                                <button key={s.key} onClick={() => handleSetPostSort(s.key)} aria-label={`Sort by ${s.label}`} style={{
                                                    padding: '6px 14px', borderRadius: 20, border: `1px solid ${postSort === s.key ? C.blue : C.border}`,
                                                    background: postSort === s.key ? '#E7F3FF' : C.card,
                                                    color: postSort === s.key ? C.blue : C.textSec,
                                                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}>{s.label}</button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Posts Feed */}
                                    {posts.length === 0 ? (
                                        <div style={{
                                            textAlign: 'center', padding: '40px 20px', background: C.card,
                                            borderRadius: 12, border: `1px solid ${C.border}`,
                                        }}>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: C.text }}>No Posts Yet</p>
                                            <p style={{ fontSize: 13, color: C.textSec }}>Be The First To Share Something!</p>
                                        </div>
                                    ) : (
                                        [...posts]
                                            .sort((a, b) => {
                                                // Pinned posts always first
                                                if (a.is_pinned && !b.is_pinned) return -1;
                                                if (!a.is_pinned && b.is_pinned) return 1;
                                                // Announcements after pinned, before regular
                                                const aIsAnn = a.post_type === 'announcement' ? 1 : 0;
                                                const bIsAnn = b.post_type === 'announcement' ? 1 : 0;
                                                if (aIsAnn !== bIsAnn) return bIsAnn - aIsAnn;
                                                if (postSort === 'top') return ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0));
                                                return new Date(b.created_at) - new Date(a.created_at);
                                            })
                                            .map(post => (
                                            <PostCard
                                                key={post.id}
                                                post={post}
                                                user={user}
                                                onLike={handleLike}
                                                onComment={handleCommentAdded}
                                                onDelete={handleDeletePost}
                                                onPin={handlePinPost}
                                                onEdit={handleEditPost}
                                                onDeleteComment={handleDeleteComment}
                                                isPageOwner={isPageOwner}
                                                page={page}
                                                isOwnerOnOwnPage={isOwnerOnOwnPage}
                                                onOpenArticle={setArticleReader}
                                            />
                                        ))
                                    )}
                                    {/* #1 Infinite Scroll Sentinel */}
                                    {hasMorePosts && posts.length >= 10 && (
                                        <div ref={loadMoreSentinelRef} style={{ textAlign: 'center', padding: 16 }}>
                                            {loadingMore && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                    {[1, 2].map(i => (
                                                        <div key={i} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
                                                            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                                                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ width: '30%', height: 12, borderRadius: 4, background: '#E4E6EB', marginBottom: 6, animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                                                    <div style={{ width: '20%', height: 10, borderRadius: 4, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                                                </div>
                                                            </div>
                                                            <div style={{ width: '100%', height: 14, borderRadius: 4, background: '#E4E6EB', marginBottom: 6, animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                                            <div style={{ width: '70%', height: 14, borderRadius: 4, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {activeTab === 'about' && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20,
                                }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>About</h2>

                                    {page.description && (
                                        <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 16 }}>
                                            {page.description}
                                        </p>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {page.location_city && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                                                </svg>
                                                <span style={{ fontSize: 14, color: C.text }}>{page.location_city}, {page.location_state}</span>
                                            </div>
                                        )}
                                        {page.website && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                                                </svg>
                                                <a href={page.website} target="_blank" rel="noopener noreferrer"
                                                    style={{ fontSize: 14, color: C.blue, textDecoration: 'none' }}>
                                                    {page.website.replace(/^https?:\/\//, '')}
                                                </a>
                                            </div>
                                        )}
                                        {page.contact_email && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7" />
                                                </svg>
                                                <span style={{ fontSize: 14, color: C.text }}>{page.contact_email}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                                                <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                            <span style={{ fontSize: 14, color: C.textSec }}>
                                                Created {new Date(page.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </span>
                                        </div>
                                        {page.phone && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                                                </svg>
                                                <a href={`tel:${page.phone}`} style={{ fontSize: 14, color: C.blue, textDecoration: 'none' }}>
                                                    {page.phone}
                                                </a>
                                            </div>
                                        )}
                                        {page.category && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: '#E7F3FF', padding: '3px 10px', borderRadius: 12, textTransform: 'capitalize' }}>
                                                    {page.category.replace(/_/g, ' ')}
                                                </span>
                                                {page.page_type && (
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec, background: C.bg, padding: '3px 10px', borderRadius: 12, textTransform: 'capitalize' }}>
                                                        {page.page_type.replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {/* P7-10: Social media links */}
                                        {page.metadata?.social_links && (
                                            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                                {page.metadata.social_links.instagram && (
                                                    <a href={page.metadata.social_links.instagram.startsWith('http') ? page.metadata.social_links.instagram : `https://instagram.com/${page.metadata.social_links.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20,
                                                        background: 'linear-gradient(45deg, #833AB4, #FD1D1D, #F77737)', color: '#fff',
                                                        fontSize: 12, fontWeight: 600, textDecoration: 'none',
                                                    }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="#fff" strokeWidth="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#fff" strokeWidth="2"/><circle cx="18" cy="6" r="1.5"/></svg>
                                                        Instagram
                                                    </a>
                                                )}
                                                {page.metadata.social_links.twitter && (
                                                    <a href={page.metadata.social_links.twitter.startsWith('http') ? page.metadata.social_links.twitter : `https://x.com/${page.metadata.social_links.twitter.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20,
                                                        background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                                                    }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                                        X / Twitter
                                                    </a>
                                                )}
                                                {page.metadata.social_links.facebook && (
                                                    <a href={page.metadata.social_links.facebook.startsWith('http') ? page.metadata.social_links.facebook : `https://facebook.com/${page.metadata.social_links.facebook}`} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20,
                                                        background: '#1877F2', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                                                    }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                                        Facebook
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* P11-1 + P11-6: Page Stats */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                                        {page.page_type && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
                                                </svg>
                                                <span style={{ fontSize: 14, color: C.text, textTransform: 'capitalize' }}>{page.page_type.replace('_', ' ')} Page</span>
                                            </div>
                                        )}
                                        {page.created_at && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                                </svg>
                                                <span style={{ fontSize: 14, color: C.text }}>Page Created {new Date(page.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'members' && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>
                                            Members ({page.follower_count || 0})
                                        </h2>
                                    </div>
                                    {/* Member Search */}
                                    <input
                                        type="text" value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                                        placeholder="Search members..."
                                        style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 20,
                                            border: `1px solid ${C.border}`, fontSize: 13,
                                            fontFamily: 'inherit', outline: 'none', background: C.bg,
                                            marginBottom: 12, boxSizing: 'border-box',
                                        }}
                                    />

                                    {followers.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 30 }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DADDE1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                                                <circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0114 0v2" />
                                                <line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" />
                                            </svg>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Members Yet</p>
                                            <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Be the first to join this page!</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {followers
                                                .filter(f => !memberSearch || (f.profile?.full_name || f.profile?.username || '').toLowerCase().includes(memberSearch.toLowerCase()))
                                                .map(f => (
                                                <div key={f.id} onClick={() => f.profile?.username && router.push(`/hub/user/${f.profile.username}`)} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                                                    borderBottom: `1px solid ${C.bg}`, cursor: f.profile?.username ? 'pointer' : 'default',
                                                    borderRadius: 8, transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <Avatar src={f.profile?.avatar_url} name={f.profile?.full_name || f.profile?.username} size={44} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            {f.profile?.full_name || f.profile?.username || 'Unknown'}
                                                            {/* #9 Role badges */}
                                                            {f.role && f.role !== 'member' && (
                                                                <span style={{
                                                                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                                                    background: f.role === 'owner' ? '#E7F3FF' : f.role === 'admin' ? '#FFF3E0' : '#E8F5E9',
                                                                    color: f.role === 'owner' ? C.blue : f.role === 'admin' ? '#E65100' : '#2E7D32',
                                                                    textTransform: 'capitalize',
                                                                }}>{f.role}</span>
                                                            )}
                                                        </div>
                                                        {/* #16 Join date formatting */}
                                                        <div style={{ fontSize: 12, color: C.textSec }}>
                                                            {f.profile?.username && <span>@{f.profile.username} · </span>}
                                                            Member since {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                        </div>
                                                    </div>
                                                    {user && f.user_id !== user.id && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleFollowUser(f.user_id); }} style={{
                                                            padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                                                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                                            background: followingUsers.has(f.user_id) ? '#E4E6EB' : C.blue,
                                                            color: followingUsers.has(f.user_id) ? C.text : '#fff',
                                                        }}>
                                                            {followingUsers.has(f.user_id) ? 'Following' : 'Follow'}
                                                        </button>
                                                    )}
                                                    {f.profile?.username && (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                            <polyline points="9 18 15 12 9 6" />
                                                        </svg>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Reviews Tab (#1) */}
                            {activeTab === 'reviews' && (
                                <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>
                                            Reviews {reviews.length > 0 && `(${reviews.length})`}
                                        </h2>
                                        {user && !isPageOwner && (
                                            <button onClick={() => setShowReviewForm(!showReviewForm)} style={{
                                                padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                                                cursor: 'pointer', fontFamily: 'inherit', background: C.blue, color: '#fff',
                                            }}>Write a Review</button>
                                        )}
                                    </div>

                                    {/* Average Rating */}
                                    {avgRating > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: 12, background: C.bg, borderRadius: 10 }}>
                                            <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>{avgRating}</div>
                                            <div>
                                                <div style={{ display: 'flex', gap: 2 }}>
                                                    {[1,2,3,4,5].map(s => (
                                                        <span key={s} style={{ color: s <= Math.round(avgRating) ? '#F5A623' : '#DDD', fontSize: 18 }}>{'\u2605'}</span>
                                                    ))}
                                                </div>
                                                <span style={{ fontSize: 12, color: C.textSec }}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Write Review Form */}
                                    {showReviewForm && (
                                        <div style={{ padding: 16, background: C.bg, borderRadius: 10, marginBottom: 16 }}>
                                            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 8px' }}>Your Rating</p>
                                            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                                                {[1,2,3,4,5].map(s => (
                                                    <button key={s} onClick={() => setReviewRating(s)} style={{
                                                        border: 'none', background: 'none', cursor: 'pointer', fontSize: 28, padding: 0,
                                                        color: s <= reviewRating ? '#F5A623' : '#CCC',
                                                    }}>{'\u2605'}</button>
                                                ))}
                                            </div>
                                            <input value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} placeholder="Review title (optional)"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />
                                            <textarea value={reviewContent} onChange={e => setReviewContent(e.target.value)} placeholder="Share your experience..."
                                                rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                <button onClick={submitReview} disabled={!reviewRating || submittingReview} style={{
                                                    padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                                                    cursor: reviewRating ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                                                    background: reviewRating ? C.blue : '#CCC', color: '#fff', opacity: submittingReview ? 0.6 : 1,
                                                }}>{submittingReview ? 'Submitting...' : 'Submit'}</button>
                                                <button onClick={() => setShowReviewForm(false)} style={{
                                                    padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card,
                                                    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: C.text,
                                                }}>Cancel</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Review List */}
                                    {reviewsLoading ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {[1,2,3].map(i => (
                                                <div key={i} style={{ padding: 14, background: C.bg, borderRadius: 10 }}>
                                                    <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                                                        <div className="shimmer" style={{ width: 36, height: 36, borderRadius: '50%', background: '#E4E6EB' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div className="shimmer" style={{ width: '40%', height: 12, borderRadius: 6, background: '#E4E6EB', marginBottom: 6 }} />
                                                            <div className="shimmer" style={{ width: '25%', height: 10, borderRadius: 6, background: '#E4E6EB' }} />
                                                        </div>
                                                    </div>
                                                    <div className="shimmer" style={{ width: '100%', height: 14, borderRadius: 6, background: '#E4E6EB', marginBottom: 4 }} />
                                                    <div className="shimmer" style={{ width: '80%', height: 14, borderRadius: 6, background: '#E4E6EB' }} />
                                                </div>
                                            ))}
                                        </div>
                                    ) : reviews.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 30 }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DADDE1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                                            </svg>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Reviews Yet</p>
                                            <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Be the first to share your experience!</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {reviews.map(r => (
                                                <div key={r.id} style={{ padding: 14, background: C.bg, borderRadius: 10 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                        <Avatar src={r.reviewer?.avatar_url} name={r.reviewer?.display_name} size={36} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.reviewer?.display_name || 'Anonymous'}</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <div style={{ display: 'flex', gap: 1 }}>
                                                                    {[1,2,3,4,5].map(s => (
                                                                        <span key={s} style={{ color: s <= r.overall_rating ? '#F5A623' : '#DDD', fontSize: 13 }}>{'\u2605'}</span>
                                                                    ))}
                                                                </div>
                                                                <span style={{ fontSize: 11, color: C.textSec }}>{timeAgo(r.created_at)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {r.title && <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{r.title}</div>}
                                                    {r.content && <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, margin: '0 0 8px' }}>{r.content}</p>}
                                                    {/* P11-4: Helpful vote */}
                                                    <button onClick={(e) => {
                                                        e.preventDefault();
                                                        const el = e.currentTarget;
                                                        const countEl = el.querySelector('.helpful-count');
                                                        const current = parseInt(countEl?.textContent || '0');
                                                        countEl.textContent = current + 1;
                                                        el.style.color = C.blue;
                                                        el.disabled = true;
                                                    }} style={{
                                                        background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                                                        color: C.textSec, padding: 0, fontFamily: 'inherit', display: 'flex',
                                                        alignItems: 'center', gap: 4,
                                                    }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" /></svg>
                                                        Helpful <span className="helpful-count" style={{ fontWeight: 600 }}>0</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Live Games Tab (#2) */}
                            {activeTab === 'games' && (
                                <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>
                                        Live Games {games.length > 0 && `(${games.length})`}
                                    </h2>

                                    {gamesLoading ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {[1,2].map(i => (
                                                <div key={i} style={{ padding: 16, background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
                                                    <div className="shimmer" style={{ width: '60%', height: 16, borderRadius: 6, background: '#E4E6EB', marginBottom: 10 }} />
                                                    <div className="shimmer" style={{ width: '40%', height: 12, borderRadius: 6, background: '#E4E6EB', marginBottom: 8 }} />
                                                    <div className="shimmer" style={{ width: '30%', height: 28, borderRadius: 6, background: '#E4E6EB' }} />
                                                </div>
                                            ))}
                                        </div>
                                    ) : games.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 30 }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DADDE1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                                                <rect x="2" y="6" width="20" height="12" rx="2" /><line x1="6" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="18" y2="12" /><circle cx="12" cy="12" r="2" />
                                            </svg>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Live Games Right Now</p>
                                            <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Check back later for active tables!</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {games.map(g => (
                                                <div key={g.id} style={{ padding: 16, background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                                        <div>
                                                            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{g.game_name || `${g.game_type} ${g.stakes}`}</div>
                                                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                                                                {g.table_number && `${g.table_number} · `}{g.stakes}
                                                                {g.dealer_name && ` · Dealer: ${g.dealer_name}`}
                                                            </div>
                                                        </div>
                                                        <span style={{
                                                            padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                                                            background: g.status === 'running' ? '#E8F5E9' : '#FFF3E0',
                                                            color: g.status === 'running' ? '#2E7D32' : '#E65100',
                                                        }}>{g.status === 'running' ? 'Running' : 'Open'}</span>
                                                    </div>

                                                    {/* Seat Grid */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 32px)', gap: 4, marginBottom: 10 }}>
                                                        {Array.from({ length: g.max_seats || 9 }).map((_, i) => {
                                                            const seat = (g.seats || []).find(s => s.seat_number === i + 1);
                                                            return (
                                                                <div key={i} title={seat ? seat.player_name : `Seat ${i + 1} (empty)`} style={{
                                                                    width: 30, height: 30, borderRadius: '50%',
                                                                    background: seat?.avatar_url ? `url(${seat.avatar_url}) center/cover` : seat ? C.blue : '#E0E0E0',
                                                                    border: `2px solid ${seat ? C.blue : '#CCC'}`,
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: 10, color: seat ? '#fff' : '#999', fontWeight: 700,
                                                                }}>{!seat?.avatar_url && (seat ? seat.player_name?.[0]?.toUpperCase() : i + 1)}</div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: 12, color: C.textSec }}>
                                                            {g.seated_count}/{g.max_seats || 9} seated
                                                            {g.waitlist_count > 0 && ` · ${g.waitlist_count} waitlisted`}
                                                        </span>
                                                        {user && isFollowing && g.seated_count < (g.max_seats || 9) && !g.source && (
                                                            <button onClick={() => handleSeatAction(g.id, 'seat')} disabled={!!seatAction} style={{
                                                                padding: '5px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                                                                cursor: 'pointer', fontFamily: 'inherit', background: C.green, color: '#fff',
                                                                opacity: seatAction?.gameId === g.id ? 0.6 : 1,
                                                            }}>{seatAction?.gameId === g.id ? 'Joining...' : 'Take Seat'}</button>
                                                        )}
                                                        {user && isFollowing && g.seated_count >= (g.max_seats || 9) && !g.source && (
                                                            <button onClick={() => handleSeatAction(g.id, 'waitlist')} disabled={!!seatAction} style={{
                                                                padding: '5px 14px', borderRadius: 8, border: `1px solid ${C.blue}`, fontSize: 12, fontWeight: 600,
                                                                cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: C.blue,
                                                                opacity: seatAction?.gameId === g.id ? 0.6 : 1,
                                                            }}>{seatAction?.gameId === g.id ? 'Joining...' : 'Join Waitlist'}</button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Media Gallery Tab */}
                            {activeTab === 'media' && (() => {
                                const allMedia = posts.flatMap(p => (p.media_urls || []).map(url => ({ url, postId: p.id, author: p.author, created_at: p.created_at })));
                                return (
                                    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                                        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>
                                            Media {allMedia.length > 0 && `(${allMedia.length})`}
                                        </h2>
                                        {allMedia.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: 30 }}>
                                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCD0D5" strokeWidth="1.5">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                                                </svg>
                                                <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '12px 0 4px' }}>No Media Shared Yet</p>
                                                <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Photos from posts will appear here!</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, borderRadius: 8, overflow: 'hidden' }}>
                                                {allMedia.map((m, i) => (
                                                    <div key={i} onClick={() => setLightboxMedia({ list: allMedia, index: i })} style={{
                                                        aspectRatio: '1', cursor: 'pointer', overflow: 'hidden', position: 'relative',
                                                    }}>
                                                        <img src={m.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                                                            onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                                                            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Tournament Schedule Tab (#F1 Commander Bridge) */}
                            {activeTab === 'schedule' && (
                                <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>
                                        Tournament Schedule {tournaments.length > 0 && `(${tournaments.length})`}
                                    </h2>

                                    {tournamentsLoading ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {[1,2,3].map(i => (
                                                <div key={i} style={{ padding: 16, background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
                                                    <div className="shimmer" style={{ width: '60%', height: 16, borderRadius: 6, background: '#E4E6EB', marginBottom: 10 }} />
                                                    <div className="shimmer" style={{ width: '40%', height: 12, borderRadius: 6, background: '#E4E6EB' }} />
                                                </div>
                                            ))}
                                        </div>
                                    ) : tournaments.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 30 }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DADDE1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                                                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                                                <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Upcoming Tournaments</p>
                                            <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Tournament schedules will appear here when posted.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {tournaments.map(t => {
                                                const startDate = t.scheduled_start ? new Date(t.scheduled_start) : null;
                                                const isToday = startDate && new Date().toDateString() === startDate.toDateString();
                                                const isPast = startDate && startDate < new Date();
                                                const statusColors = {
                                                    scheduled: { bg: 'rgba(35,116,225,0.12)', text: '#2374e1' },
                                                    registration: { bg: 'rgba(49,162,76,0.12)', text: '#31a24c' },
                                                    running: { bg: 'rgba(240,40,73,0.12)', text: '#f02849' },
                                                    paused: { bg: 'rgba(255,165,0,0.12)', text: '#FFA500' },
                                                    final_table: { bg: 'rgba(139,92,246,0.12)', text: '#8b5cf6' },
                                                };
                                                const sc = statusColors[t.status] || statusColors.scheduled;
                                                const typeLabels = {
                                                    freezeout: 'Freezeout', rebuy: 'Rebuy', bounty: 'Bounty',
                                                    satellite: 'Satellite', shootout: 'Shootout', turbo: 'Turbo', hyper: 'Hyper-Turbo',
                                                };
                                                return (
                                                    <div key={t.id} style={{
                                                        padding: 16, background: C.bg, borderRadius: 12,
                                                        border: `1px solid ${isToday ? '#2374e1' : C.border}`,
                                                        position: 'relative', overflow: 'hidden',
                                                    }}>
                                                        {/* Status ribbon */}
                                                        {(t.status === 'running' || t.status === 'registration') && (
                                                            <div style={{
                                                                position: 'absolute', top: 0, right: 0, padding: '3px 12px',
                                                                background: sc.text, color: '#fff', fontSize: 10, fontWeight: 700,
                                                                textTransform: 'uppercase', letterSpacing: 0.5,
                                                                borderBottomLeftRadius: 8,
                                                            }}>{t.status === 'running' ? 'LIVE' : 'REG OPEN'}</div>
                                                        )}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{t.name}</div>
                                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                    <span style={{
                                                                        display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                                                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                                                        background: sc.bg, color: sc.text,
                                                                    }}>{typeLabels[t.type] || t.type}</span>
                                                                    {t.bounty > 0 && (
                                                                        <span style={{
                                                                            display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                                                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                                                            background: 'rgba(240,40,73,0.12)', color: '#f02849',
                                                                        }}>Bounty ${t.bounty}</span>
                                                                    )}
                                                                    {t.rebuys && (
                                                                        <span style={{
                                                                            display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                                                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                                                            background: 'rgba(255,165,0,0.12)', color: '#FFA500',
                                                                        }}>Rebuys</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>${t.buyin}</div>
                                                                <div style={{ fontSize: 10, color: C.textSec }}>
                                                                    ${t.buyin_amount} + ${t.buyin_fee} fee
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                                            <div style={{ display: 'flex', gap: 16 }}>
                                                                <div>
                                                                    <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>
                                                                        {isToday ? 'Today' : startDate ? startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'}
                                                                    </div>
                                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                                                                        {startDate ? startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                                                                    </div>
                                                                </div>
                                                                {t.entries > 0 && (
                                                                    <div>
                                                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Entries</div>
                                                                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                                                                            {t.entries}{t.max_entries ? `/${t.max_entries}` : ''}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {t.remaining > 0 && t.status === 'running' && (
                                                                    <div>
                                                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Remaining</div>
                                                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#31a24c' }}>{t.remaining}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {t.guaranteed > 0 && (
                                                                <div style={{
                                                                    padding: '4px 10px', borderRadius: 8,
                                                                    background: 'rgba(49,162,76,0.1)', border: '1px solid rgba(49,162,76,0.2)',
                                                                }}>
                                                                    <div style={{ fontSize: 10, color: '#31a24c', fontWeight: 600 }}>GTD</div>
                                                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#31a24c' }}>${t.guaranteed.toLocaleString()}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {t.description && (
                                                            <p style={{ fontSize: 12, color: C.textSec, marginTop: 8, marginBottom: 0, lineHeight: 1.4 }}>{t.description}</p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Recently Completed */}
                                    {recentTournaments.length > 0 && (
                                        <div style={{ marginTop: 24 }}>
                                            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.textSec, margin: '0 0 12px' }}>Recently Completed</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {recentTournaments.map(t => (
                                                    <div key={t.id} style={{
                                                        padding: 12, background: C.bg, borderRadius: 10, opacity: 0.7,
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    }}>
                                                        <div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.name}</div>
                                                            <div style={{ fontSize: 11, color: C.textSec }}>
                                                                {t.entries} entries · {t.scheduled_start ? new Date(t.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>${t.buyin}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div style={{ position: 'sticky', top: 72 }}>
                            {/* Quick Info Card */}
                            <div style={{
                                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                            }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>Page Info</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                    <div style={{ textAlign: 'center', padding: 8, background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{page.follower_count || 0}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Followers</div>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: 8, background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{page.post_count || 0}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Posts</div>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: 8, background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{page.view_count || 0}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Views</div>
                                    </div>
                                </div>
                                {/* Average Rating line (#3) */}
                                {avgRating > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                                        <div style={{ display: 'flex', gap: 1 }}>
                                            {[1,2,3,4,5].map(s => (
                                                <span key={s} style={{ color: s <= Math.round(avgRating) ? '#F5A623' : '#DDD', fontSize: 14 }}>{'\u2605'}</span>
                                            ))}
                                        </div>
                                        <span style={{ fontSize: 12, color: C.textSec }}>{avgRating} ({reviews.length})</span>
                                    </div>
                                )}
                                {/* P7-9: Engagement summary */}
                                {posts.length > 0 && (
                                    <div style={{ marginTop: 10, padding: '8px 10px', background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: 'uppercase' }}>Engagement</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text }}>
                                            <span>Avg Likes/Post</span>
                                            <span style={{ fontWeight: 700 }}>{(posts.reduce((sum, p) => sum + (p.like_count || 0), 0) / posts.length).toFixed(1)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, marginTop: 2 }}>
                                            <span>Avg Comments/Post</span>
                                            <span style={{ fontWeight: 700 }}>{(posts.reduce((sum, p) => sum + (p.comment_count || 0), 0) / posts.length).toFixed(1)}</span>
                                        </div>
                                    </div>
                                )}
                                {/* Actions: Notify + Report */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    {user && isFollowing && (
                                        <button onClick={toggleNotifications} disabled={togglingNotify} title={notifyEnabled ? 'Notifications on' : 'Notifications off'} style={{
                                            flex: 1, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
                                            background: notifyEnabled ? '#E7F3FF' : C.card, color: notifyEnabled ? C.blue : C.textSec,
                                            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                        }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill={notifyEnabled ? C.blue : 'none'} stroke="currentColor" strokeWidth="2">
                                                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
                                            </svg>
                                            {notifyEnabled ? 'Notifying' : 'Notify'}
                                        </button>
                                    )}
                                    {user && !isPageOwner && (
                                        <button onClick={() => setShowReportModal(true)} style={{
                                            padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
                                            background: C.card, color: C.textSec, fontSize: 12, fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                        }}>Report</button>
                                    )}
                                </div>
                            </div>

                            {/* Live Activity Pulse */}
                            <div style={{
                                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                            }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                        background: (games.length > 0 || tournaments.some(t => t.status === 'running')) ? '#42B72A' : '#CCC',
                                        animation: (games.length > 0 || tournaments.some(t => t.status === 'running')) ? 'pulseActivity 1.5s ease-in-out infinite' : 'none',
                                    }} />
                                    Activity
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: C.text }}>
                                        <span>Live Games</span>
                                        <span style={{ fontWeight: 700, color: games.length > 0 ? '#42B72A' : C.textSec }}>{games.length || 0}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: C.text }}>
                                        <span>Tournaments</span>
                                        <span style={{
                                            fontWeight: 700,
                                            color: tournaments.some(t => t.status === 'running') ? '#E65100' : C.textSec,
                                        }}>
                                            {tournaments.filter(t => t.status === 'running').length > 0
                                                ? `${tournaments.filter(t => t.status === 'running').length} LIVE`
                                                : tournaments.filter(t => ['scheduled','registration'].includes(t.status)).length > 0
                                                    ? `${tournaments.filter(t => ['scheduled','registration'].includes(t.status)).length} upcoming`
                                                    : 'None'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: C.text }}>
                                        <span>Last Post</span>
                                        <span style={{ fontWeight: 600, color: C.textSec, fontSize: 12 }}>
                                            {posts.length > 0 ? timeAgo(posts[0]?.created_at) : 'No posts'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Share URL Card */}
                            <div style={{
                                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                            }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Share This Page</h3>
                                <div style={{
                                    background: C.bg, borderRadius: 8, padding: '10px 12px',
                                    fontSize: 12, color: C.blue, wordBreak: 'break-all',
                                    border: `1px solid ${C.border}`, marginBottom: 8,
                                }}>
                                    {`https://smarter.poker/hub/social-pages/${page.slug || page.id}`}
                                </div>
                                <button onClick={() => {
                                    const url = `${window.location.origin}/hub/social-pages/${page.slug || page.id}`;
                                    navigator.clipboard.writeText(url).then(() => toast.success('Link copied!')).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                }} id="copy-feedback" style={{
                                    width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                                    background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    Copy Link
                                </button>

                                {/* QR Code Widget (#8 - Referral Enhanced) */}
                                {page.slug && (() => {
                                    // Use referral QR API for attribution tracking
                                    const refCode = page.metadata?.referral_code;
                                    const siteUrl = 'https://smarter.poker';
                                    const qrUrl = refCode
                                        ? `${siteUrl}/hub/social-media?ref=${refCode}`
                                        : `${siteUrl}/hub/social-pages/${page.slug}`;
                                    return (
                                        <div style={{ marginTop: 12, textAlign: 'center' }}>
                                            <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 8px', fontWeight: 500 }}>
                                                Scan QR Code
                                            </p>
                                            <QRCanvas value={qrUrl} size={140} />
                                            <p style={{ fontSize: 10, color: C.textSec, margin: '6px 0 0' }}>
                                                {refCode ? 'Scans auto-follow this page' : 'Print for flyers and table signs'}
                                            </p>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* #11: OG Share Card Preview */}
                            <div style={{
                                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                            }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textSec, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Share Preview</h3>
                                <div style={{
                                    borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden',
                                    background: '#fafafa',
                                }}>
                                    <div style={{
                                        height: 100,
                                        background: page.cover_url
                                            ? `url(${page.cover_url}) center/cover`
                                            : `linear-gradient(135deg, ${C.blue}, #8b5cf6)`,
                                    }} />
                                    <div style={{ padding: '10px 12px' }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: C.textSec, marginBottom: 2, textTransform: 'uppercase' }}>smarter.poker</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{page.name}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {page.description || 'A social page on Smarter.Poker'}
                                        </div>
                                    </div>
                                </div>
                                <p style={{ fontSize: 10, color: C.textSec, margin: '6px 0 0', textAlign: 'center' }}>This is how your page looks when shared</p>
                            </div>

                            {/* #12: Page Insights Widget (Owner-Only) */}
                            {isPageOwner && posts.length > 0 && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                                }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2">
                                            <path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" />
                                            <path d="M18 12a2 2 0 000 4h4v-4h-4z" />
                                        </svg>
                                        Page Insights
                                    </h3>
                                    {/* 7-day post sparkline */}
                                    {(() => {
                                        const now = Date.now();
                                        const days = Array.from({ length: 7 }, (_, i) => {
                                            const dayStart = new Date(now - (6 - i) * 86400000);
                                            dayStart.setHours(0, 0, 0, 0);
                                            const dayEnd = new Date(dayStart.getTime() + 86400000);
                                            return posts.filter(p => {
                                                const t = new Date(p.created_at).getTime();
                                                return t >= dayStart.getTime() && t < dayEnd.getTime();
                                            }).length;
                                        });
                                        const max = Math.max(...days, 1);
                                        const h = 40;
                                        const w = 200;
                                        const points = days.map((v, i) => `${(i / 6) * w},${h - (v / max) * h}`).join(' ');
                                        return (
                                            <div style={{ marginBottom: 10 }}>
                                                <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600, marginBottom: 4 }}>Post Activity (7 days)</div>
                                                <svg width={w} height={h + 4} viewBox={`0 0 ${w} ${h + 4}`}>
                                                    <polyline points={points} fill="none" stroke={C.blue} strokeWidth="2" strokeLinejoin="round" />
                                                    {days.map((v, i) => (
                                                        <circle key={i} cx={(i / 6) * w} cy={h - (v / max) * h} r="3" fill={C.blue} />
                                                    ))}
                                                </svg>
                                            </div>
                                        );
                                    })()}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text }}>
                                            <span>Total Followers</span>
                                            <span style={{ fontWeight: 700 }}>{page.follower_count || 0}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text }}>
                                            <span>Total Posts</span>
                                            <span style={{ fontWeight: 700 }}>{posts.length}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text }}>
                                            <span>Engagement Rate</span>
                                            <span style={{ fontWeight: 700, color: C.blue }}>
                                                {posts.length > 0
                                                    ? `${((posts.reduce((s, p) => s + (p.like_count || 0) + (p.comment_count || 0), 0) / posts.length / Math.max(page.follower_count || 1, 1)) * 100).toFixed(1)}%`
                                                    : '0%'}
                                            </span>
                                        </div>
                                        {(() => {
                                            const topPost = [...posts].sort((a, b) => ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0)))[0];
                                            if (!topPost) return null;
                                            return (
                                                <div style={{ marginTop: 6, padding: '8px 10px', background: C.bg, borderRadius: 8 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: 'uppercase' }}>Top Post</div>
                                                    <div style={{ fontSize: 12, color: C.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                        {topPost.content || 'Media post'}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>
                                                        {topPost.like_count || 0} likes · {topPost.comment_count || 0} comments
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* #10: Suggested Pages */}
                            {user && !isPageOwner && suggestedSidebarPages.length > 0 && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                                }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 10px' }}>Suggested Pages</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {suggestedSidebarPages.map(sp => (
                                            <div key={sp.id} onClick={() => router.push(`/hub/social-pages/${sp.slug || sp.id}`)} style={{
                                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                                                borderRadius: 8, background: C.bg, cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#E7F3FF'}
                                            onMouseLeave={e => e.currentTarget.style.background = C.bg}
                                            >
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                                    background: sp.avatar_url ? `url(${sp.avatar_url}) center/cover` : C.blue,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#fff', fontWeight: 700, fontSize: 14,
                                                }}>{!sp.avatar_url && (sp.name || '?')[0].toUpperCase()}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</div>
                                                    <div style={{ fontSize: 11, color: C.textSec }}>{sp.follower_count || 0} followers</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Invite Friends Card */}
                            {user && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                                }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Invite Friends</h3>
                                    <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 10px' }}>Help {page.name} grow!</p>
                                    <button onClick={async () => {
                                        setShowInviteModal(true);
                                        if (inviteFriends.length === 0) {
                                            setInviteLoading(true);
                                            try {
                                                const token = getAccessToken();
                                                const res = await fetch(`/api/friends?action=list`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                const json = await res.json();
                                                if (json.success && json.data?.friends) {
                                                    // Filter out users who are already followers
                                                    const followerIds = new Set(followers.map(f => f.user_id || f.profile?.id));
                                                    const filtered = json.data.friends.filter(f => !followerIds.has(f.id));
                                                    setInviteFriends(filtered);
                                                }
                                            } catch (e) { console.warn('Failed to load friends:', e); }
                                            setInviteLoading(false);
                                        }
                                    }} style={{
                                        width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
                                        background: '#E7F3FF', color: C.blue, fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', gap: 6,
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <circle cx="9" cy="7" r="4" />
                                            <path d="M2 21v-2a7 7 0 0114 0v2" />
                                            <line x1="19" y1="8" x2="19" y2="14" />
                                            <line x1="16" y1="11" x2="22" y2="11" />
                                        </svg>
                                        Invite Friends
                                    </button>
                                </div>
                            )}

                            {/* Recent Members */}
                            {followers.length > 0 && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 12px' }}>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Recent Members ({followers.length})</h3>
                                        <button onClick={() => setActiveTab('members')} style={{
                                            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                                            color: C.blue, fontWeight: 600, fontFamily: 'inherit', padding: 0,
                                        }}>View All</button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {followers.slice(0, 10).map(f => (
                                            <Avatar key={f.id} src={f.profile?.avatar_url} name={f.profile?.full_name} size={36} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
              <BottomNavBar />

              {/* Invite Friends Modal */}
              {showInviteModal && (
                  <div style={{
                      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                  }} onClick={() => setShowInviteModal(false)}>
                      <div style={{
                          background: C.card, borderRadius: 16, maxWidth: 420, width: '100%',
                          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                          boxShadow: '0 8px 40px rgba(0,0,0,0.3)', overflow: 'hidden',
                      }} onClick={e => e.stopPropagation()}>
                          {/* Header */}
                          <div style={{
                              padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Invite Friends to {page.name}</h3>
                              <button onClick={() => setShowInviteModal(false)} style={{
                                  background: C.bg, border: 'none', cursor: 'pointer', fontSize: 16,
                                  width: 32, height: 32, borderRadius: '50%', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center', color: C.text,
                              }}>✕</button>
                          </div>
                          {/* Search */}
                          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
                              <input
                                  type="text" value={inviteSearch}
                                  onChange={e => setInviteSearch(e.target.value)}
                                  placeholder="Search friends..."
                                  style={{
                                      width: '100%', padding: '8px 12px', borderRadius: 20,
                                      border: `1px solid ${C.border}`, fontSize: 13,
                                      fontFamily: 'inherit', outline: 'none', background: C.bg,
                                      boxSizing: 'border-box',
                                  }}
                              />
                          </div>
                          {/* Friends List */}
                          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                              {inviteLoading ? (
                                  <div style={{ padding: 40, textAlign: 'center', color: C.textSec, fontSize: 14 }}>Loading friends...</div>
                              ) : inviteFriends.length === 0 ? (
                                  <div style={{ padding: 40, textAlign: 'center', color: C.textSec }}>
                                      <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
                                      <div style={{ fontSize: 14, fontWeight: 500 }}>No friends to invite</div>
                                      <div style={{ fontSize: 12, marginTop: 4 }}>All your friends are already following this page!</div>
                                  </div>
                              ) : (
                                  inviteFriends
                                      .filter(f => !inviteSearch || (f.full_name || f.display_name || f.username || '').toLowerCase().includes(inviteSearch.toLowerCase()))
                                      .map(friend => (
                                          <div key={friend.id} style={{
                                              display: 'flex', alignItems: 'center', gap: 12,
                                              padding: '10px 20px',
                                          }}>
                                              <Avatar src={friend.avatar_url} name={friend.display_name || friend.username} size={40} />
                                              <div style={{ flex: 1 }}>
                                                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                                                      {friend.display_name || friend.full_name || friend.username}
                                                  </div>
                                                  {friend.username && (
                                                      <div style={{ fontSize: 12, color: C.textSec }}>@{friend.username}</div>
                                                  )}
                                              </div>
                                              <button
                                                  disabled={invitedIds.has(friend.id)}
                                                  onClick={() => {
                                                      const url = `${window.location.origin}/hub/social-pages/${page.slug || page.id}`;
                                                      navigator.clipboard.writeText(url).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                                      setInvitedIds(prev => new Set([...prev, friend.id]));
                                                      toast.success(`Invite link copied for ${friend.display_name || friend.username}!`);
                                                  }}
                                                  style={{
                                                      padding: '6px 16px', borderRadius: 6, border: 'none',
                                                      background: invitedIds.has(friend.id) ? '#E4E6EB' : C.blue,
                                                      color: invitedIds.has(friend.id) ? C.textSec : '#fff',
                                                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                  }}
                                              >
                                                  {invitedIds.has(friend.id) ? 'Invited' : 'Invite'}
                                              </button>
                                          </div>
                                      ))
                              )}
                          </div>
                          {/* Share Link Footer */}
                          <div style={{
                              padding: '12px 20px', borderTop: `1px solid ${C.border}`,
                              display: 'flex', gap: 8, alignItems: 'center',
                          }}>
                              <button onClick={() => {
                                  const url = `${window.location.origin}/hub/social-pages/${page.slug || page.id}`;
                                  navigator.clipboard.writeText(url).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                  toast.success('Page link copied!');
                              }} style={{
                                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                                  background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'inherit',
                              }}>
                                  Copy Page Link
                              </button>
                          </div>
                      </div>
                  </div>
              )}

              {/* Lightbox Modal */}
              {lightboxMedia && (() => {
                  const { list, index } = lightboxMedia;
                  const item = list[index];
                  return (
                      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => setLightboxMedia(null)}>
                          {/* Close */}
                          <button onClick={() => setLightboxMedia(null)} style={{
                              position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none',
                              borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#fff', fontSize: 20, zIndex: 2,
                          }}>&times;</button>
                          {/* Prev */}
                          {index > 0 && (
                              <button onClick={e => { e.stopPropagation(); setLightboxMedia({ list, index: index - 1 }); }} style={{
                                  position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                                  width: 44, height: 44, cursor: 'pointer', color: '#fff', fontSize: 22, zIndex: 2,
                              }}>&lsaquo;</button>
                          )}
                          {/* Image */}
                          <img src={item?.url} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }} />
                          {/* Next */}
                          {index < list.length - 1 && (
                              <button onClick={e => { e.stopPropagation(); setLightboxMedia({ list, index: index + 1 }); }} style={{
                                  position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                                  width: 44, height: 44, cursor: 'pointer', color: '#fff', fontSize: 22, zIndex: 2,
                              }}>&rsaquo;</button>
                          )}
                          {/* P7-5 Author overlay + Counter */}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  {item?.author && (
                                      <>
                                          <Avatar src={item.author?.avatar_url} name={item.author?.full_name || item.author?.username} size={32} />
                                          <div>
                                              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{item.author?.full_name || item.author?.username || 'Unknown'}</div>
                                              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{item.created_at ? timeAgo(item.created_at) : ''}</div>
                                          </div>
                                      </>
                                  )}
                              </div>
                              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{index + 1} / {list.length}</div>
                          </div>
                      </div>
                  );
              })()}

              {/* Report Modal (#6) */}
              {showReportModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowReportModal(false)}>
                      <div style={{ background: C.card, borderRadius: 16, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>Report Page</h3>
                          <p style={{ fontSize: 13, color: C.textSec, margin: '0 0 12px' }}>Why are you reporting this page?</p>
                          <select value={reportReason} onChange={e => setReportReason(e.target.value)} style={{
                              width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                              fontSize: 14, fontFamily: 'inherit', background: C.bg, color: C.text, boxSizing: 'border-box',
                          }}>
                              <option value="">Select a reason...</option>
                              <option value="spam">Spam or scam</option>
                              <option value="inappropriate">Inappropriate content</option>
                              <option value="fake">Fake or misleading</option>
                              <option value="harassment">Harassment or bullying</option>
                              <option value="other">Other</option>
                          </select>
                          <textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} placeholder="Additional details (optional)..."
                              rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', marginTop: 10, resize: 'vertical', boxSizing: 'border-box', background: C.bg, color: C.text }} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                              <button onClick={() => setShowReportModal(false)} style={{
                                  padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card,
                                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: C.text,
                              }}>Cancel</button>
                              <button onClick={submitReport} disabled={!reportReason || submittingReport} style={{
                                  padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                                  cursor: reportReason ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                                  background: reportReason ? C.red : '#CCC', color: '#fff',
                                  opacity: submittingReport ? 0.6 : 1,
                              }}>{submittingReport ? 'Sending...' : 'Submit Report'}</button>
                          </div>
                      </div>
                  </div>
              )}

              {/* P10-7: Scroll-to-top button */}
              {showScrollTop && (
                  <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{
                      position: 'fixed', bottom: 90, right: 24, width: 44, height: 44,
                      borderRadius: '50%', border: 'none', background: C.blue, color: '#fff',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', cursor: 'pointer', zIndex: 9998,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'opacity 0.3s, transform 0.3s',
                      opacity: showScrollTop ? 1 : 0,
                      transform: showScrollTop ? 'scale(1)' : 'scale(0.7)',
                  }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="18 15 12 9 6 15" />
                      </svg>
                  </button>
              )}

              {/* Toast Notification */}
              {toastMsg && (
                  <div style={{
                      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
                      background: toastMsg.type === 'error' ? '#d32f2f' : '#2e7d32', color: '#fff', padding: '10px 24px', borderRadius: 8,
                      fontSize: 14, fontWeight: 600, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      animation: 'sp-toast-in 0.3s ease',
                  }}>
                      {toastMsg.text || toastMsg}
                  </div>
              )}
            </div>

            {/* Phase 9: GoLive Modal */}
            <GoLiveModal
                isOpen={showGoLiveModal}
                onClose={(action) => {
                    setShowGoLiveModal(false);
                    LiveStreamService.getLiveStreams().then(setLiveStreams).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    // Show success toast for stream actions
                    if (action === 'posted') toast.success('Stream replay posted to your feed!');
                    else if (action === 'saved') toast.success('Stream saved as draft');
                    else if (action === 'deleted') toast.success('Stream recording deleted');
                }}
                user={user}
            />

            {/* Phase 9: Live Stream Viewer */}
            {watchingStream && (
                <LiveStreamViewer
                    stream={watchingStream}
                    userId={user?.id}
                    onClose={() => {
                        setWatchingStream(null);
                        LiveStreamService.getLiveStreams().then(setLiveStreams).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }}
                />
            )}

            {/* Phase 9: In-App Article Reader */}
            {articleReader.open && (
                <ArticleReaderModal
                    url={articleReader.url}
                    title={articleReader.title}
                    onClose={() => setArticleReader({ open: false, url: null, title: null })}
                />
            )}

            {/* Phase 9: Check-In Modal */}
            {showCheckInModal && (
                <CheckInModal
                    onClose={() => setShowCheckInModal(false)}
                    userId={user?.id}
                    onSelect={(venue) => {
                        // #6: Optimistic check-in — show temp post immediately
                        const checkinContent = `Checked in at ${venue.name}${venue.city ? ` \u2014 ${venue.city}${venue.state ? `, ${venue.state}` : ''}` : ''}`;
                        const tempId = `temp-checkin-${Date.now()}`;
                        const tempPost = {
                            id: tempId, content: checkinContent, content_type: 'text',
                            author_id: user?.id, page_id: page?.id, created_at: new Date().toISOString(),
                            author: { id: user?.id, full_name: user?.user_metadata?.full_name || 'You', avatar_url: user?.user_metadata?.avatar_url },
                            like_count: 0, comment_count: 0, user_liked: false, media_urls: [],
                            checkin_venue: { name: venue.name, city: venue.city || '', state: venue.state || '' },
                        };
                        setPosts(prev => [tempPost, ...prev]);
                        (async () => {
                            try {
                                const token = getAccessToken();
                                const res = await fetch('/api/social/pages/posts', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({
                                        page_id: page?.id,
                                        content: checkinContent,
                                        content_type: 'text',
                                        author_id: user?.id,
                                    }),
                                });
                                if (res.ok) {
                                    busEmit.dataMutated('social-pages');
                                    broadcastSync('smarter_poker_social_sync', { action: 'refresh_feed', tabId: BROADCAST_TAB_ID });
                                    toast.success('Checked in successfully!');
                                    fetchPosts(); // Replace temp with real post
                                } else {
                                    setPosts(prev => prev.filter(p => p.id !== tempId));
                                    toast.error('Check-in failed');
                                }
                            } catch (e) {
                                console.warn('[CheckIn] Error:', e);
                                setPosts(prev => prev.filter(p => p.id !== tempId));
                                toast.error('Check-in failed');
                            }
                        })();
                        setShowCheckInModal(false);
                    }}
                />
            )}

            <style>{`
                @keyframes reactPopIn { 0% { transform: scale(0.3) translateY(10px); opacity: 0; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
                @keyframes likePopAnim { 0% { transform: scale(0); opacity: 1; } 50% { transform: scale(1.3); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
                @keyframes pulseActivity { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes shimmerAnim { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
                .shimmer { background: linear-gradient(90deg, #E4E6EB 25%, #F0F2F5 50%, #E4E6EB 75%) !important; background-size: 400px 100%; animation: shimmerAnim 1.2s ease-in-out infinite; }
                @keyframes sp-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
                @keyframes sp-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
                @keyframes sp-confetti-fall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(60px) rotate(720deg); opacity: 0; } }
                @keyframes sp-milestone-in { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
                @media (max-width: 768px) {
                    div[style*="grid-template-columns: 1fr 320px"] {
                        grid-template-columns: 1fr !important;
                    }
                    .mobile-action-bar {
                        display: flex !important;
                    }
                }
            `}</style>

            {/* #9: Milestone Confetti Overlay */}
            {showMilestone && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {/* Confetti particles */}
                    {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} style={{
                            position: 'absolute',
                            top: `${15 + Math.random() * 30}%`,
                            left: `${10 + Math.random() * 80}%`,
                            width: 8, height: 8,
                            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                            background: ['#F5A623', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#E91E63'][i % 6],
                            animation: `sp-confetti-fall ${1.5 + Math.random()}s ease-out ${Math.random() * 0.5}s forwards`,
                        }} />
                    ))}
                    {/* Milestone card */}
                    <div style={{
                        background: '#fff', borderRadius: 20, padding: '24px 36px',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                        textAlign: 'center', animation: 'sp-milestone-in 0.5s ease-out',
                        border: '3px solid #F5A623',
                    }}>
                        <div style={{ fontSize: 42, marginBottom: 4 }}>🎉</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#050505' }}>{showMilestone.toLocaleString()} Followers!</div>
                        <div style={{ fontSize: 14, color: '#65676B', marginTop: 4 }}>Your page hit a milestone!</div>
                    </div>
                </div>
            )}
        </>
    );
}

// ══════════════════════════════════════════════════════════════════════════
//  PHASE 2 — UNIFIED CANONICAL URL FOR HOME GAMES
// ══════════════════════════════════════════════════════════════════════════
//  When a user lands on /hub/social-pages/{uuid} and the page is a home_game,
//  redirect to the canonical /hub/home-games/{slug} URL. One group, one URL.
//
//  Other page types (venue, group, community, brand, club) render normally —
//  this getServerSideProps returns empty props and the existing client-side
//  page loader takes over as before.
//
//  Keep this export minimal and defensive: any DB error, any missing slug,
//  anything unexpected → fall through to normal rendering so we never break
//  existing venue/group/community/brand/club pages.
// ══════════════════════════════════════════════════════════════════════════

import { createClient as _spgssCreateClient } from '@supabase/supabase-js';

let _spgssSupabase = null;
function _spgssGetSupabase() {
    if (!_spgssSupabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return null;
        try {
            _spgssSupabase = _spgssCreateClient(url, key, { auth: { persistSession: false } });
        } catch {
            return null;
        }
    }
    return _spgssSupabase;
}

export async function getServerSideProps({ params }) {
    const pageId = params?.pageId;
    // UUID-ish check: the old social-pages route takes a UUID. Anything else,
    // bail out and let the client loader handle it (so slug-style URLs still
    // land on the old page if somehow routed here).
    if (!pageId || typeof pageId !== 'string') return { props: {} };

    const sb = _spgssGetSupabase();
    if (!sb) return { props: {} };

    try {
        // Fetch just the type + slug. If it's a home_game and has a slug,
        // 308-redirect to the canonical unified URL.
        const { data, error } = await sb
            .from('social_pages')
            .select('page_type, slug')
            .eq('id', pageId)
            .maybeSingle();

        if (error || !data) return { props: {} };

        if (data.page_type === 'home_game' && data.slug) {
            return {
                redirect: {
                    destination: `/hub/home-games/${data.slug}`,
                    permanent: true, // 308 — search engines collapse the two URLs
                },
            };
        }
    } catch {
        // Swallow errors silently. This function is a progressive enhancement;
        // never let it break normal venue/group/community/brand/club rendering.
    }

    return { props: {} };
}
