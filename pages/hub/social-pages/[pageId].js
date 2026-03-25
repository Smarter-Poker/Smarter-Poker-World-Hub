/**
 * Social Page Detail View - Full page with feed, followers, about, and content management
 * Supports venue, group, community, and brand pages
 */
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveIdentity } from '../../../src/contexts/ActiveIdentityContext';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
import SkeletonLight from '../../../src/components/ui/SkeletonLight';
import { supabase } from '../../../src/lib/supabase';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

// Lightweight QR Code component — uses Google Charts API (zero dependencies)
function QRCanvas({ value, size = 140 }) {
    if (!value) return null;
    const qrSrc = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(value)}&choe=UTF-8`;
    return (
        <img
            src={qrSrc}
            alt="QR Code"
            width={size}
            height={size}
            style={{ borderRadius: 8, border: '1px solid #E4E6EB' }}
        />
    );
}

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', red: '#FA383E',
};

const timeAgo = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    const days = Math.floor(s / 86400);
    if (days < 30) return `${days}d ago`;
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function Avatar({ src, name, size = 40 }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            background: src ? `url(${src}) center/cover` : C.blue,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: size * 0.4,
        }}>
            {!src && (name || '?')[0].toUpperCase()}
        </div>
    );
}

function PostCard({ post, user, onLike, onComment, onDelete, onPin, isPageOwner, page, isOwnerOnOwnPage }) {
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState(post.content || '');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const menuRef = useRef(null);

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;
        const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [showMenu]);

    const canManage = isPageOwner || (user && post.author_id === user.id);

    const fetchComments = async () => {
        if (comments.length > 0) { setShowComments(!showComments); return; }
        setLoadingComments(true);
        try {
            const res = await fetch(`/api/social/pages/engage?post_id=${post.id}`);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setComments(json.data || []);
        } catch (e) { console.error("[[pageId].js]", e); }
        setLoadingComments(false);
        setShowComments(true);
    };

    const submitComment = async () => {
        if (!commentText.trim() || !user) return;
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/engage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'comment', post_id: post.id, user_id: user.id, content: commentText.trim() }),
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) { setComments(prev => [...prev, json.data]); setCommentText(''); onComment(post.id); }
        } catch (e) { console.error("[[pageId].js]", e); }
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
            if (res.ok) { post.content = editContent.trim(); setEditing(false); }
        } catch (e) { console.error(e); }
    };

    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/hub/social-pages/${page?.slug || page?.id}` : '';

    return (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 12, overflow: 'hidden', position: 'relative' }}>
            {/* Pinned badge */}
            {post.is_pinned && (
                <div style={{ padding: '6px 16px', background: '#E7F3FF', fontSize: 12, fontWeight: 600, color: C.blue, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={C.blue}><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                    Pinned Post
                </div>
            )}

            {/* Author + Menu */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                <Avatar src={post.author?.avatar_url} name={post.author?.full_name || post.author?.username} size={40} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                        {post.author?.full_name || post.author?.username || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec }}>{timeAgo(post.created_at)}</div>
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
                <div style={{ padding: '0 16px 12px', fontSize: 14, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {post.content}
                </div>
            ) : null}

            {/* Media */}
            {post.media_urls && post.media_urls.length > 0 && (
                <div>{post.media_urls.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt="" style={{ maxWidth: '100%', display: 'block', margin: '0 auto', marginBottom: post.media_urls.length > 1 ? 2 : 0 }} />
                ))}</div>
            )}

            {/* Stats */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', fontSize: 13, color: C.textSec }}>
                <span>{post.like_count || 0} likes</span>
                <span>{post.comment_count || 0} comments</span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', borderTop: `1px solid ${C.border}`, borderBottom: showComments ? `1px solid ${C.border}` : 'none' }}>
                {[
                    { label: post.user_liked ? 'Liked' : 'Like', action: () => onLike(post.id), active: post.user_liked },
                    { label: 'Comment', action: fetchComments },
                    { label: 'Share', action: () => setShowShareModal(true) },
                ].map((btn, i) => (
                    <button key={i} onClick={btn.action} style={{
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
                            <button onClick={() => { navigator.clipboard.writeText(shareUrl); setShowShareModal(false); }} style={{
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
                            <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px 16px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                            <button onClick={() => { onDelete(post.id); setConfirmDelete(false); }} style={{ flex: 1, padding: '10px 16px', background: '#F02849', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comments */}
            {showComments && (
                <div style={{ padding: '8px 16px 12px' }}>
                    {loadingComments ? (
                        <p style={{ fontSize: 13, color: C.textSec, textAlign: 'center' }}>Loading...</p>
                    ) : (
                        <>
                            {comments.map(c => (
                                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <Avatar src={c.author?.avatar_url} name={c.author?.full_name} size={28} />
                                    <div style={{ background: C.bg, borderRadius: 12, padding: '8px 12px', flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.author?.full_name || c.author?.username || 'Unknown'}</div>
                                        <div style={{ fontSize: 13, color: C.text }}>{c.content}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{timeAgo(c.created_at)}</div>
                                    </div>
                                </div>
                            ))}
                            {user && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <Avatar
                                        src={isOwnerOnOwnPage ? page?.avatar_url : user.user_metadata?.avatar_url}
                                        name={isOwnerOnOwnPage ? page?.name : (user.user_metadata?.full_name || user.email)}
                                        size={28}
                                    />
                                    <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                                        <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && submitComment()}
                                            placeholder={isOwnerOnOwnPage ? `Comment as ${page?.name}...` : 'Write A Comment...'}
                                            style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: C.bg }} />
                                        <button onClick={submitComment} disabled={!commentText.trim()} style={{
                                            padding: '6px 12px', borderRadius: 20, border: 'none',
                                            background: commentText.trim() ? C.blue : '#E4E6EB',
                                            color: commentText.trim() ? '#fff' : C.textSec,
                                            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                        }}>Post</button>
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
    const router = useRouter();
    const { pageId } = router.query;
    const { user } = useAuthUser();
    useTrainingBus('social-page-detail');
    const { isClubMode, clubPage } = useActiveIdentity();
    const [page, setPage] = useState(null);
    const [posts, setPosts] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('posts');
    const [isFollowing, setIsFollowing] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [newPost, setNewPost] = useState('');
    const [posting, setPosting] = useState(false);
    const [uploadImages, setUploadImages] = useState([]);
    const [memberSearch, setMemberSearch] = useState('');
    const imageInputRef = useRef(null);
    // Invite friends
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteFriends, setInviteFriends] = useState([]);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [invitedIds, setInvitedIds] = useState(new Set());
    const [inviteSearch, setInviteSearch] = useState('');

    // Toast notification system
    const [toastMsg, setToastMsg] = useState(null);
    const toastTimerRef = useRef(null);
    const toast = {
        success: (msg, duration = 3000) => {
            setToastMsg(msg);
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



    const fetchPage = useCallback(async (signal) => {
        if (!pageId) return;
        setLoading(true);
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
            if (e.name !== 'AbortError') console.error('Failed to fetch page:', e);
        }
        setLoading(false);
    }, [pageId, user]);

    const fetchPosts = useCallback(async (signal) => {
        if (!page?.id) return;
        try {
            const params = new URLSearchParams({ page_id: page.id, limit: '30' });
            if (user?.id) params.set('user_id', user.id);
            const res = await fetch(`/api/social/pages/posts?${params}`, { signal });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setPosts(json.data || []);
        } catch (e) { if (e.name !== 'AbortError') console.error("[[pageId].js]", e); }
    }, [page, user]);

    const fetchFollowers = useCallback(async () => {
        if (!page?.id) return;
        try {
            const reqParam = user?.id ? `&requester_id=${user.id}` : '';
            const res = await fetch(`/api/social/pages/follow?page_id=${page.id}${reqParam}`);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setFollowers(json.data || []);
        } catch (e) { console.error("[[pageId].js]", e); }
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
  // Realtime subscription — live updates (posts, interactions, followers)
  useEffect(() => {

    if (!router.isReady) return;

    if (!pageId || !page) return;
    // Use resolved page.id UUID for realtime, not the raw URL param (which may be a slug)
    const resolvedId = page.id;
    const _ch = supabase
      .channel(`social-page:${resolvedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_page_posts', filter: `page_id=eq.${resolvedId}` }, () => {
        fetchPosts();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_interactions', filter: `page_id=eq.${resolvedId}` }, () => {
        fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_followers', filter: `page_id=eq.${resolvedId}` }, () => {
        fetchFollowers();
        // Update follower count from fresh data
        setPage(prev => prev ? { ...prev, follower_count: (prev.follower_count || 0) } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [pageId, page, fetchPosts, fetchFollowers]);

    const handleFollow = async () => {
        if (!user) { router.push('/auth/login'); return; }
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
        } catch (e) {
            console.error("[[pageId].js]", e);
            // Rollback optimistic update
            setIsFollowing(!newState);
            setPage(prev => prev ? { ...prev, follower_count: prevCount } : prev);
        }
    };

    const handlePost = async () => {
        if ((!newPost.trim() && uploadImages.length === 0) || !user || !page) return;
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
                    page_id: page.id, author_id: user.id,
                    content: newPost.trim(), content_type: uploadImages.length > 0 ? 'media' : 'text',
                    ...(uploadImages.length > 0 ? { media_urls: uploadImages } : {}),
                }),
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) {
                toast.success('Posted successfully!');
                busEmit.dataMutated('social-pages');
                busEmit.dataMutated('social');
                setNewPost('');
                setUploadImages([]);
                fetchPosts();
            }
        } catch (e) { console.error("[[pageId].js]", e); toast.success('Post failed — try again'); }
        setPosting(false);
    };

    const handleLike = async (postId) => {
        if (!user) return;
        setPosts(prev => prev.map(p =>
            p.id === postId ? {
                ...p,
                user_liked: !p.user_liked,
                like_count: p.user_liked ? Math.max(0, (p.like_count || 1) - 1) : (p.like_count || 0) + 1
            } : p
        ));
        try {
            const token = getAccessToken();
            await fetch('/api/social/pages/engage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'like', post_id: postId, user_id: user.id }),
            });
            busEmit.dataMutated('social-pages');
        } catch (e) { console.error("[[pageId].js]", e); }
    };

    const handleDeletePost = async (postId) => {
        setPosts(prev => prev.filter(p => p.id !== postId));
        try {
            const token = getAccessToken();
            await fetch(`/api/social/pages/posts?id=${postId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            busEmit.dataMutated('social-pages');
            toast.success('Post deleted');
        } catch (e) { console.error(e); toast.error('Failed to delete post'); }
    };

    const handlePinPost = async (postId, pinned) => {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: pinned } : { ...p, is_pinned: false }));
        try {
            const token = getAccessToken();
            await fetch('/api/social/pages/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ id: postId, is_pinned: pinned }),
            });
            busEmit.dataMutated('social-pages');
            toast.success(pinned ? 'Post pinned' : 'Post unpinned');
        } catch (e) { console.error(e); }
    };

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        for (const file of files.slice(0, 4)) {
            const ext = file.name.split('.').pop();
            const path = `social-pages/${page.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { data, error } = await supabase.storage.from('social-media-uploads').upload(path, file);
            if (!error && data) {
                const { data: urlData } = supabase.storage.from('social-media-uploads').getPublicUrl(data.path);
                setUploadImages(prev => [...prev, urlData.publicUrl]);
            }
        }
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const handleCommentAdded = (postId) => {
        setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
        ));
    };

    if (loading) {
        return (
            <>
                <UniversalHeader />
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
                <UniversalHeader />
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
                            borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
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
            <UniversalHeader />

            <div style={{
                minHeight: '100vh', background: C.bg, paddingBottom: 72,
                fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
            }}>
                {/* Cover */}
                <div style={{
                    height: 200, background: page.cover_url
                        ? `url(${page.cover_url}) center/cover` : `linear-gradient(135deg, ${pageColor}, #8b5cf6)`,
                    paddingTop: 56,
                }} />

                {/* Page Info Header */}
                <div style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px' }}>
                        {/* Avatar and name */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: -40 }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: 16, border: `4px solid ${C.card}`,
                                background: page.avatar_url ? `url(${page.avatar_url}) center/cover` : pageColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 800, fontSize: 28, flexShrink: 0,
                            }}>
                                {!page.avatar_url && page.name[0].toUpperCase()}
                            </div>
                            <div style={{ paddingBottom: 8, flex: 1 }}>
                                <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {page.name}
                                    {page.is_verified && (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill={C.blue}>
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                    )}
                                </h1>
                                <p style={{ fontSize: 14, color: C.textSec, margin: '2px 0 0' }}>
                                    {(page.page_type || 'page').charAt(0).toUpperCase() + (page.page_type || 'page').slice(1)}
                                    {page.category && page.category !== 'general' && ` - ${page.category}`}
                                    {' '} - {page.follower_count || 0} followers
                                </p>
                                {page.slug && (
                                    <p style={{ fontSize: 13, color: C.blue, margin: '4px 0 0', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                        </svg>
                                        smarter.poker/.../{ page.slug }
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Description */}
                        {page.description && (
                            <p style={{ fontSize: 14, color: C.textSec, margin: '12px 0 0', lineHeight: 1.5 }}>
                                {page.description}
                            </p>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
                            <button onClick={handleFollow} style={{
                                padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 14,
                                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                background: isFollowing ? '#E4E6EB' : C.blue,
                                color: isFollowing ? C.text : '#fff',
                            }}>
                                {isFollowing ? 'Following' : 'Follow'}
                            </button>
                            {userRole === 'owner' && (
                                <button onClick={() => router.push(`/hub/social-pages/${pageId}/manage`)} style={{
                                    padding: '8px 20px', borderRadius: 8, border: 'none',
                                    background: '#E4E6EB', color: C.text, fontSize: 14,
                                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    Manage Page
                                </button>
                            )}
                        </div>

                        {/* Mobile Share Bar (hidden on desktop where sidebar has share widget) */}
                        <div className="mobile-share-bar" style={{
                            display: 'none', alignItems: 'center', gap: 8,
                            padding: '10px 0', borderTop: `1px solid ${C.border}`,
                        }}>
                            <div style={{
                                flex: 1, padding: '8px 12px', borderRadius: 8,
                                background: C.bg, fontSize: 12, color: C.blue,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                border: `1px solid ${C.border}`,
                            }}>
                                {typeof window !== 'undefined' ? `${window.location.origin}/hub/social-pages/${page.slug || page.id}` : ''}
                            </div>
                            <button onClick={() => {
                                const url = `${window.location.origin}/hub/social-pages/${page.slug || page.id}`;
                                if (navigator.share) {
                                    navigator.share({ title: page.name, url }).catch(() => {});
                                } else {
                                    navigator.clipboard.writeText(url).catch(() => {});
                                }
                            }} style={{
                                padding: '8px 14px', borderRadius: 8, border: 'none',
                                background: C.blue, color: '#fff', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                            }}>
                                Share
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${C.border}` }}>
                            {['posts', 'about', 'members'].map(t => (
                                <button key={t} onClick={() => setActiveTab(t)} style={{
                                    padding: '12px 16px', border: 'none', background: 'none',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    color: activeTab === t ? C.blue : C.textSec,
                                    borderBottom: `3px solid ${activeTab === t ? C.blue : 'transparent'}`,
                                    textTransform: 'capitalize',
                                }}>
                                    {t}
                                </button>
                            ))}
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
                                    {/* Create Post */}
                                    {user && (isFollowing || userRole === 'owner') && (
                                        <div style={{
                                            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                                            padding: 16, marginBottom: 16,
                                        }}>
                                            {isOwnerOnOwnPage && (
                                                <div style={{
                                                    fontSize: 12, color: '#1877F2', fontWeight: 600,
                                                    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 10px', background: '#E7F3FF', borderRadius: 8,
                                                }}>
                                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1877F2', display: 'inline-block' }} />
                                                    Posting as {page.name}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <Avatar
                                                    src={isOwnerOnOwnPage ? page.avatar_url : user.user_metadata?.avatar_url}
                                                    name={isOwnerOnOwnPage ? page.name : (user.user_metadata?.full_name || user.email)}
                                                    size={40}
                                                />
                                                <textarea
                                                    value={newPost}
                                                    onChange={e => setNewPost(e.target.value)}
                                                    placeholder={isOwnerOnOwnPage ? `Post as ${page.name}...` : `Write something to ${page.name}...`}
                                                    style={{
                                                        flex: 1, padding: '10px 12px', borderRadius: 12,
                                                        border: `1px solid ${C.border}`, fontSize: 14,
                                                        fontFamily: 'inherit', outline: 'none', resize: 'none',
                                                        minHeight: 60, background: C.bg,
                                                    }}
                                                />
                                            </div>
                                            {/* Image Upload Preview */}
                                            {uploadImages.length > 0 && (
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                                    {uploadImages.map((url, i) => (
                                                        <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden' }}>
                                                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            <button onClick={() => setUploadImages(prev => prev.filter((_, j) => j !== i))} style={{
                                                                position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                                                                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer',
                                                                fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            }}>×</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageUpload} />
                                                    <button onClick={() => imageInputRef.current?.click()} title="Add Photo" style={{
                                                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                                                        borderRadius: 6, color: '#42B72A', fontSize: 14,
                                                    }}>
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                                            <path d="M21 15l-5-5L5 21" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <button onClick={handlePost} disabled={(!newPost.trim() && uploadImages.length === 0) || posting} style={{
                                                    padding: '8px 20px', borderRadius: 8, border: 'none',
                                                    background: (newPost.trim() || uploadImages.length > 0) && !posting ? C.blue : '#E4E6EB',
                                                    color: (newPost.trim() || uploadImages.length > 0) && !posting ? '#fff' : C.textSec,
                                                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}>
                                                    {posting ? 'Posting...' : 'Post'}
                                                </button>
                                            </div>
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
                                        posts.map(post => (
                                            <PostCard
                                                key={post.id}
                                                post={post}
                                                user={user}
                                                onLike={handleLike}
                                                onComment={handleCommentAdded}
                                                onDelete={handleDeletePost}
                                                onPin={handlePinPost}
                                                isPageOwner={isPageOwner}
                                                page={page}
                                                isOwnerOnOwnPage={isOwnerOnOwnPage}
                                            />
                                        ))
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
                                        <div style={{ textAlign: 'center', padding: 20 }}>
                                            <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
                                            <p style={{ fontSize: 14, color: C.textSec }}>No members yet. Be the first to join!</p>
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
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                                                            {f.profile?.full_name || f.profile?.username || 'Unknown'}
                                                        </div>
                                                        <div style={{ fontSize: 12, color: C.textSec }}>
                                                            {f.profile?.username && <span>@{f.profile.username} · </span>}
                                                            Joined {timeAgo(f.created_at)}
                                                        </div>
                                                    </div>
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
                        </div>

                        {/* Sidebar */}
                        <div style={{ position: 'sticky', top: 72 }}>
                            {/* Quick Info Card */}
                            <div style={{
                                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                            }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>Page Info</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div style={{ textAlign: 'center', padding: 8, background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{page.follower_count || 0}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Followers</div>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: 8, background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{page.post_count || 0}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Posts</div>
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
                                    {typeof window !== 'undefined' ? `${window.location.origin}/hub/social-pages/${page.slug || page.id}` : ''}
                                </div>
                                <button onClick={() => {
                                    const url = `${window.location.origin}/hub/social-pages/${page.slug || page.id}`;
                                    navigator.clipboard.writeText(url).then(() => toast.success('Link copied!')).catch(() => {});
                                }} id="copy-feedback" style={{
                                    width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                                    background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    Copy Link
                                </button>

                                {/* QR Code Widget */}
                                {page.slug && (() => {
                                    const qrUrl = typeof window !== 'undefined'
                                        ? `${window.location.origin}/hub/social-pages/${page.slug}`
                                        : `https://smarter.poker/hub/social-pages/${page.slug}`;
                                    return (
                                        <div style={{ marginTop: 12, textAlign: 'center' }}>
                                            <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 8px', fontWeight: 500 }}>
                                                Scan QR Code
                                            </p>
                                            <QRCanvas value={qrUrl} size={140} />
                                            <p style={{ fontSize: 10, color: C.textSec, margin: '6px 0 0' }}>
                                                Print for flyers and table signs
                                            </p>
                                        </div>
                                    );
                                })()}
                            </div>

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
                                            } catch (e) { console.error('Failed to load friends:', e); }
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
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>Recent Members</h3>
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
                                                      navigator.clipboard.writeText(url);
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
                                  navigator.clipboard.writeText(url);
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

              {/* Toast Notification */}
              {toastMsg && (
                  <div style={{
                      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
                      background: '#2e7d32', color: '#fff', padding: '10px 24px', borderRadius: 8,
                      fontSize: 14, fontWeight: 600, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      animation: 'sp-toast-in 0.3s ease',
                  }}>
                      {toastMsg}
                  </div>
              )}
            </div>

            <style jsx global>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes sp-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
                @media (max-width: 768px) {
                    div[style*="grid-template-columns: 1fr 320px"] {
                        grid-template-columns: 1fr !important;
                    }
                    .mobile-share-bar {
                        display: flex !important;
                    }
                }
            `}</style>
        </>
    );
}
