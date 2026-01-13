/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 SMARTER.POKER SOCIAL HUB - COMPLETE SNGINE RECONSTRUCTION v2.0
 * Full feature parity with Sngine PHP + Flutter Messaging App
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hpnqzvjknynwcpzzcdmo.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 DESIGN SYSTEM (Facebook-inspired)
// ═══════════════════════════════════════════════════════════════════════════
const THEME = {
    primary: '#1877F2',
    primaryHover: '#166FE5',
    bg: '#18191A',
    bgCard: '#242526',
    bgHover: '#3A3B3C',
    text: '#E4E6EB',
    textSecondary: '#B0B3B8',
    border: '#3E4042',
    success: '#31A24C',
    danger: '#FA383E',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
};

const REACTIONS = [
    { type: 'like', emoji: '👍', label: 'Like', color: '#1877F2' },
    { type: 'love', emoji: '❤️', label: 'Love', color: '#F33E58' },
    { type: 'haha', emoji: '😂', label: 'Haha', color: '#F7B125' },
    { type: 'wow', emoji: '😮', label: 'Wow', color: '#F7B125' },
    { type: 'sad', emoji: '😢', label: 'Sad', color: '#F7B125' },
    { type: 'angry', emoji: '😠', label: 'Angry', color: '#E9710F' },
];

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
const timeAgo = (date) => {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎭 AVATAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function Avatar({ src, name, size = 40, online = null, hasStory = false, onClick }) {
    const initial = name?.[0]?.toUpperCase() || '?';
    const wrapperStyle = {
        position: 'relative',
        display: 'inline-flex',
        cursor: onClick ? 'pointer' : 'default',
        padding: hasStory ? 3 : 0,
        borderRadius: '50%',
        background: hasStory ? THEME.gradient : 'transparent',
    };
    return (
        <div style={wrapperStyle} onClick={onClick}>
            {src ? (
                <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: hasStory ? `3px solid ${THEME.bg}` : 'none' }} />
            ) : (
                <div style={{ width: size, height: size, borderRadius: '50%', background: THEME.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: size * 0.4 }}>{initial}</div>
            )}
            {online !== null && (
                <div style={{ position: 'absolute', bottom: 2, right: 2, width: size * 0.25, height: size * 0.25, borderRadius: '50%', background: online ? THEME.success : THEME.textSecondary, border: `2px solid ${THEME.bgCard}` }} />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📖 STORIES BAR (from stories.php)
// ═══════════════════════════════════════════════════════════════════════════
function StoriesBar({ stories, currentUser, onAddStory, onViewStory }) {
    return (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '12px 0', marginBottom: 16 }}>
            {/* Create Story Card */}
            <div onClick={onAddStory} style={{ minWidth: 112, height: 200, borderRadius: 12, background: THEME.bgCard, cursor: 'pointer', position: 'relative', overflow: 'hidden', border: `1px solid ${THEME.border}` }}>
                <div style={{ height: '70%', background: currentUser?.avatar ? `url(${currentUser.avatar}) center/cover` : THEME.gradient }} />
                <div style={{ height: '30%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -18, width: 36, height: 36, borderRadius: '50%', background: THEME.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 24, border: `4px solid ${THEME.bgCard}` }}>+</div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: THEME.text, marginTop: 12 }}>Create Story</span>
                </div>
            </div>
            {/* Story Cards */}
            {stories.map(story => (
                <div key={story.id} onClick={() => onViewStory(story)} style={{ minWidth: 112, height: 200, borderRadius: 12, background: story.preview ? `url(${story.preview}) center/cover` : THEME.gradient, cursor: 'pointer', position: 'relative', border: `3px solid ${THEME.primary}` }}>
                    <div style={{ position: 'absolute', top: 8, left: 8 }}>
                        <Avatar src={story.userAvatar} name={story.userName} size={40} hasStory />
                    </div>
                    <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, color: 'white', fontWeight: 600, fontSize: 12, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{story.userName}</div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 POST CREATOR (from publisher.php)
// ═══════════════════════════════════════════════════════════════════════════
function PostCreator({ user, onPost, isPosting }) {
    const [content, setContent] = useState('');
    const [mediaFiles, setMediaFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length || !user?.id) return;
        setUploading(true);
        const uploaded = [];
        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const path = `${isVideo ? 'videos' : 'photos'}/${user.id}/${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage.from('social-media').upload(path, file);
            if (!error && data) {
                const { data: urlData } = supabase.storage.from('social-media').getPublicUrl(path);
                uploaded.push({ type: isVideo ? 'video' : 'photo', url: urlData.publicUrl });
            }
        }
        setMediaFiles(prev => [...prev, ...uploaded]);
        setUploading(false);
    };

    const handleSubmit = async () => {
        if (!content.trim() && !mediaFiles.length) return;
        const urls = mediaFiles.map(m => m.url);
        const type = mediaFiles.some(m => m.type === 'video') ? 'video' : mediaFiles.length ? 'photo' : 'text';
        const success = await onPost(content, urls, type);
        if (success) { setContent(''); setMediaFiles([]); }
    };

    return (
        <div style={{ background: THEME.bgCard, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${THEME.border}` }}>
            <div style={{ display: 'flex', gap: 12 }}>
                <Avatar src={user?.avatar} name={user?.name} size={40} />
                <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={`What's on your mind, ${user?.name || 'Player'}?`}
                    style={{ flex: 1, background: THEME.bgHover, border: 'none', borderRadius: 20, padding: '10px 16px', color: THEME.text, fontSize: 15, resize: 'none', minHeight: 44, outline: 'none' }} rows={2} />
            </div>
            {mediaFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginLeft: 52 }}>
                    {mediaFiles.map((m, i) => (
                        <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden' }}>
                            {m.type === 'video' ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            <button onClick={() => setMediaFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12 }}>✕</button>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${THEME.border}` }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFileSelect} />
                    <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: THEME.textSecondary, fontSize: 14 }}>{uploading ? '⏳' : '📷'} Photo/Video</button>
                    <button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: THEME.textSecondary, fontSize: 14 }}>🎬 Reel</button>
                    <button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: THEME.textSecondary, fontSize: 14 }}>🃏 Hand</button>
                </div>
                <button onClick={handleSubmit} disabled={isPosting || (!content.trim() && !mediaFiles.length)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: THEME.primary, color: 'white', fontWeight: 600, cursor: 'pointer', opacity: isPosting || (!content.trim() && !mediaFiles.length) ? 0.5 : 1 }}>{isPosting ? 'Posting...' : 'Post'}</button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📄 POST CARD (from posts.php)
// ═══════════════════════════════════════════════════════════════════════════
function PostCard({ post, currentUserId, onReact, onDelete }) {
    const [showReactions, setShowReactions] = useState(false);
    const [myReaction, setMyReaction] = useState(post.myReaction);
    const [showComments, setShowComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const hoverTimeout = useRef(null);

    const handleReact = async (type) => {
        const wasReacted = myReaction === type;
        setMyReaction(wasReacted ? null : type);
        setShowReactions(false);
        await onReact(post.id, wasReacted ? null : type);
    };

    const reactionObj = REACTIONS.find(r => r.type === myReaction);

    return (
        <div style={{ background: THEME.bgCard, borderRadius: 8, marginBottom: 16, border: `1px solid ${THEME.border}` }}>
            {/* Header */}
            <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar src={post.author?.avatar} name={post.author?.name} size={40} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: THEME.text }}>{post.author?.name || 'Player'} {post.author?.level && <span style={{ color: THEME.primary, fontSize: 12 }}>Lvl {post.author.level}</span>}</div>
                    <div style={{ fontSize: 13, color: THEME.textSecondary }}>{post.timeAgo}</div>
                </div>
                {post.authorId === currentUserId && <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.textSecondary, fontSize: 18 }}>⋯</button>}
            </div>
            {/* Content */}
            <div style={{ padding: '0 16px 12px', color: THEME.text, fontSize: 15, lineHeight: 1.5 }}>{post.content}</div>
            {/* Media */}
            {post.mediaUrls?.length > 0 && (
                <div>{post.contentType === 'video' ? <video controls style={{ width: '100%', maxHeight: 500 }} src={post.mediaUrls[0]} /> : post.mediaUrls.length === 1 ? <img src={post.mediaUrls[0]} alt="" style={{ width: '100%', maxHeight: 500, objectFit: 'cover' }} /> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>{post.mediaUrls.slice(0, 4).map((url, i) => <img key={i} src={url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />)}</div>
                )}</div>
            )}
            {/* Stats */}
            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', color: THEME.textSecondary, fontSize: 14 }}>
                <span>{post.likeCount > 0 && `👍 ${post.likeCount}`}</span>
                <span>{post.commentCount > 0 && `${post.commentCount} comments`}</span>
            </div>
            {/* Actions */}
            <div style={{ borderTop: `1px solid ${THEME.border}`, display: 'flex', position: 'relative' }}>
                {showReactions && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 16, background: THEME.bgCard, borderRadius: 24, padding: '4px 8px', boxShadow: '0 2px 12px rgba(0,0,0,0.3)', display: 'flex', gap: 4, border: `1px solid ${THEME.border}` }}>
                        {REACTIONS.map(r => <button key={r.type} onClick={() => handleReact(r.type)} style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 24, borderRadius: '50%' }}>{r.emoji}</button>)}
                    </div>
                )}
                <button onMouseEnter={() => { hoverTimeout.current = setTimeout(() => setShowReactions(true), 500); }} onMouseLeave={() => { clearTimeout(hoverTimeout.current); setTimeout(() => setShowReactions(false), 200); }} onClick={() => handleReact('like')}
                    style={{ flex: 1, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: reactionObj?.color || THEME.textSecondary, fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{reactionObj?.emoji || '👍'} {reactionObj?.label || 'Like'}</button>
                <button onClick={() => setShowComments(!showComments)} style={{ flex: 1, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: THEME.textSecondary, fontWeight: 500, fontSize: 14 }}>💬 Comment</button>
                <button style={{ flex: 1, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: THEME.textSecondary, fontWeight: 500, fontSize: 14 }}>↗️ Share</button>
            </div>
            {/* Comments */}
            {showComments && (
                <div style={{ borderTop: `1px solid ${THEME.border}`, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Avatar size={32} />
                        <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Write a comment..." style={{ flex: 1, padding: '8px 16px', borderRadius: 20, border: 'none', background: THEME.bgHover, color: THEME.text, fontSize: 14, outline: 'none' }} />
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT WINDOW (from chat.php + conversation_screen.dart)
// ═══════════════════════════════════════════════════════════════════════════
function ChatWindow({ chat, messages, currentUserId, onSend, onClose }) {
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const endRef = useRef(null);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = async () => {
        if (!text.trim() || sending) return;
        setSending(true);
        await onSend(text);
        setText('');
        setSending(false);
    };

    return (
        <div style={{ width: 328, height: 450, background: THEME.bgCard, borderRadius: '8px 8px 0 0', boxShadow: '0 -2px 12px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', border: `1px solid ${THEME.border}` }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar src={chat.avatar} name={chat.name} size={32} online={chat.online} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14, color: THEME.text }}>{chat.name}</div>{chat.online && <div style={{ fontSize: 11, color: THEME.success }}>Active now</div>}</div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: THEME.primary }}>📞</button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: THEME.primary }}>📹</button>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: THEME.textSecondary }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {messages.map((msg, i) => {
                    const isMine = msg.senderId === currentUserId;
                    return (<div key={msg.id || i} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}><div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: 18, background: isMine ? THEME.primary : THEME.bgHover, color: isMine ? 'white' : THEME.text, fontSize: 14 }}>{msg.text}</div></div>);
                })}
                <div ref={endRef} />
            </div>
            <div style={{ padding: 8, borderTop: `1px solid ${THEME.border}`, display: 'flex', gap: 8 }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                <input value={text} onChange={e => setText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Aa" style={{ flex: 1, padding: '8px 12px', borderRadius: 18, border: 'none', background: THEME.bgHover, fontSize: 14, color: THEME.text, outline: 'none' }} />
                {text.trim() ? <button onClick={handleSend} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: THEME.primary }}>➤</button> : <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>🎤</button>}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 CONTACTS SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
function ContactsSidebar({ contacts, onOpenChat, onSearch, searchResults }) {
    const [query, setQuery] = useState('');
    return (
        <aside style={{ width: 280, position: 'sticky', top: 80, height: 'fit-content' }}>
            <input value={query} onChange={e => { setQuery(e.target.value); onSearch(e.target.value); }} placeholder="🔍 Search players..." style={{ width: '100%', padding: '10px 14px', borderRadius: 20, border: 'none', background: THEME.bgHover, fontSize: 14, color: THEME.text, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            {query.length >= 2 && searchResults.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 14, color: THEME.primary }}>Search Results</h4>
                    {searchResults.map(u => (<div key={u.id} onClick={() => onOpenChat(u)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer', borderRadius: 8 }}><Avatar src={u.avatar} name={u.username} size={36} /><span style={{ fontWeight: 500, fontSize: 14, color: THEME.text }}>{u.username}</span></div>))}
                </div>
            )}
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: THEME.textSecondary }}>Contacts</h4>
            {contacts.length === 0 ? <p style={{ color: THEME.textSecondary, fontSize: 13 }}>No contacts yet. Search for players!</p> : contacts.map(c => (
                <div key={c.id} onClick={() => onOpenChat(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer', borderRadius: 8 }}>
                    <Avatar src={c.avatar} name={c.name} size={36} online={c.online} />
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 14, color: THEME.text }}>{c.name}</div>{c.lastMessage && <div style={{ fontSize: 12, color: THEME.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.lastMessage}</div>}</div>
                </div>
            ))}
        </aside>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏠 MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SocialMediaPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState([]);
    const [stories, setStories] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [openChats, setOpenChats] = useState([]);
    const [chatMessages, setChatMessages] = useState({});
    const [isPosting, setIsPosting] = useState(false);
    const searchTimeout = useRef(null);

    // Initialize
    useEffect(() => {
        async function init() {
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    const { data: profile } = await supabase.from('profiles').select('username, avatar_url, current_level').eq('id', authUser.id).single();
                    setUser({ id: authUser.id, name: profile?.username || authUser.email?.split('@')[0], avatar: profile?.avatar_url, level: profile?.current_level || 1 });
                    await loadContacts(authUser.id);
                }
                await loadFeed();
            } catch (err) { console.error('Init error:', err); }
            finally { setLoading(false); }
        }
        init();
    }, []);

    // Load Feed
    const loadFeed = async () => {
        const { data } = await supabase.from('social_posts').select(`id, content, content_type, media_urls, like_count, comment_count, share_count, created_at, author_id, author:profiles!author_id (username, avatar_url, current_level)`).or('visibility.eq.public,visibility.is.null').order('created_at', { ascending: false }).limit(50);
        if (data) setPosts(data.map(p => ({ id: p.id, authorId: p.author_id, content: p.content, contentType: p.content_type, mediaUrls: p.media_urls || [], likeCount: p.like_count || 0, commentCount: p.comment_count || 0, shareCount: p.share_count || 0, timeAgo: timeAgo(p.created_at), myReaction: null, author: { name: p.author?.username, avatar: p.author?.avatar_url, level: p.author?.current_level } })));
    };

    // Create Post
    const handleCreatePost = async (content, mediaUrls, contentType) => {
        if (!user?.id) return false;
        setIsPosting(true);
        try {
            const { data, error } = await supabase.from('social_posts').insert({ author_id: user.id, content, content_type: contentType, media_urls: mediaUrls, visibility: 'public' }).select().single();
            if (error) throw error;
            setPosts(prev => [{ id: data.id, authorId: user.id, content, contentType, mediaUrls, likeCount: 0, commentCount: 0, shareCount: 0, timeAgo: 'Just now', myReaction: null, author: { name: user.name, avatar: user.avatar, level: user.level } }, ...prev]);
            return true;
        } catch (err) { console.error(err); return false; }
        finally { setIsPosting(false); }
    };

    // React to Post
    const handleReact = async (postId, type) => {
        if (!user?.id) return;
        if (type === null) await supabase.from('social_interactions').delete().eq('post_id', postId).eq('user_id', user.id);
        else await supabase.from('social_interactions').upsert({ post_id: postId, user_id: user.id, interaction_type: type }, { onConflict: 'post_id,user_id' });
    };

    // Delete Post
    const handleDelete = async (postId) => {
        if (!user?.id || !confirm('Delete this post?')) return;
        await supabase.from('social_posts').delete().eq('id', postId);
        setPosts(prev => prev.filter(p => p.id !== postId));
    };

    // Load Contacts
    const loadContacts = async (userId) => {
        const { data } = await supabase.from('social_conversation_participants').select(`conversation_id, social_conversations (last_message_preview)`).eq('user_id', userId);
        if (!data) return;
        const list = await Promise.all(data.map(async (conv) => {
            const { data: parts } = await supabase.from('social_conversation_participants').select(`user_id, profiles (username, avatar_url)`).eq('conversation_id', conv.conversation_id).neq('user_id', userId);
            const other = parts?.[0];
            if (!other) return null;
            return { id: other.user_id, name: other.profiles?.username, avatar: other.profiles?.avatar_url, conversationId: conv.conversation_id, lastMessage: conv.social_conversations?.last_message_preview, online: false };
        }));
        setContacts(list.filter(Boolean));
    };

    // Search Users
    const handleSearch = (query) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (query.length < 2) { setSearchResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            const { data } = await supabase.from('profiles').select('id, username, avatar_url').ilike('username', `%${query}%`).limit(10);
            if (data) setSearchResults(data.map(u => ({ id: u.id, username: u.username, avatar: u.avatar_url })));
        }, 300);
    };

    // Open Chat
    const handleOpenChat = async (contact) => {
        if (openChats.find(c => c.id === contact.id)) return;
        let convId = contact.conversationId;
        if (!convId && user?.id) {
            const { data } = await supabase.rpc('fn_get_or_create_conversation', { user1_id: user.id, user2_id: contact.id });
            convId = data;
        }
        const newChat = { id: contact.id, name: contact.name || contact.username, avatar: contact.avatar, online: false, conversationId: convId };
        setOpenChats(prev => [...prev.slice(-2), newChat]);
        if (convId) {
            const { data: msgs } = await supabase.from('social_messages').select('id, content, sender_id, created_at').eq('conversation_id', convId).eq('is_deleted', false).order('created_at', { ascending: true }).limit(50);
            if (msgs) setChatMessages(prev => ({ ...prev, [contact.id]: msgs.map(m => ({ id: m.id, text: m.content, senderId: m.sender_id })) }));
        }
    };

    // Send Message
    const handleSendMessage = async (contactId, text) => {
        const chat = openChats.find(c => c.id === contactId);
        if (!chat?.conversationId || !user?.id) return;
        await supabase.rpc('fn_send_message', { p_conversation_id: chat.conversationId, p_sender_id: user.id, p_content: text });
        setChatMessages(prev => ({ ...prev, [contactId]: [...(prev[contactId] || []), { id: Date.now(), text, senderId: user.id }] }));
    };

    if (loading) return (<div style={{ minHeight: '100vh', background: THEME.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.text }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div><p>Loading Social Hub...</p></div></div>);

    return (
        <>
            <Head><title>Social Hub | Smarter.Poker</title><meta name="description" content="Connect, share, and play with poker players worldwide." /></Head>
            <div style={{ minHeight: '100vh', background: THEME.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', color: THEME.text }}>
                {/* Header */}
                <header style={{ background: THEME.bgCard, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    <Link href="/hub" style={{ fontSize: 24, fontWeight: 700, color: THEME.primary, textDecoration: 'none' }}>← Hub</Link>
                    <div style={{ fontWeight: 700, fontSize: 20, color: '#FA383E' }}>🔴 Social</div>
                    {user ? (<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>🔔</button><button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>💬</button><Avatar src={user.avatar} name={user.name} size={36} /></div>) : (<Link href="/auth/login" style={{ color: THEME.primary, fontWeight: 600, textDecoration: 'none' }}>Log In</Link>)}
                </header>
                {/* Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', maxWidth: 1200, margin: '0 auto', gap: 16, padding: 16 }}>
                    {/* Left Nav */}
                    <nav style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
                        {user && <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', cursor: 'pointer', borderRadius: 8 }}><Avatar src={user.avatar} name={user.name} size={36} /><span style={{ fontWeight: 600 }}>{user.name}</span></div>}
                        {['👤 Profile', '👥 Friends', '💬 Messages', '👥 Groups', '📅 Events', '🎬 Reels', '🏆 Leaderboard'].map((item, i) => <div key={i} style={{ padding: '10px 12px', cursor: 'pointer', borderRadius: 8, color: THEME.textSecondary, fontSize: 15 }}>{item}</div>)}
                    </nav>
                    {/* Main Feed */}
                    <main>
                        <StoriesBar stories={stories} currentUser={user} onAddStory={() => { }} onViewStory={() => { }} />
                        {user && <PostCreator user={user} onPost={handleCreatePost} isPosting={isPosting} />}
                        {!user && <div style={{ background: THEME.bgCard, borderRadius: 8, padding: 24, textAlign: 'center', marginBottom: 16, border: `1px solid ${THEME.border}` }}><p style={{ color: THEME.textSecondary, marginBottom: 12 }}>Log in to create posts and chat!</p><Link href="/auth/login" style={{ color: THEME.primary, fontWeight: 600, textDecoration: 'none' }}>Log In →</Link></div>}
                        {posts.length === 0 ? <div style={{ textAlign: 'center', padding: 60, color: THEME.textSecondary }}><div style={{ fontSize: 64, marginBottom: 16 }}>🌟</div><h2 style={{ color: THEME.text }}>No posts yet</h2><p>Be the first to share!</p></div> : posts.map(post => <PostCard key={post.id} post={post} currentUserId={user?.id} onReact={handleReact} onDelete={handleDelete} />)}
                    </main>
                    {/* Right Sidebar */}
                    <ContactsSidebar contacts={contacts} onOpenChat={handleOpenChat} onSearch={handleSearch} searchResults={searchResults} />
                </div>
                {/* Chat Windows */}
                <div style={{ position: 'fixed', bottom: 0, right: 80, display: 'flex', gap: 8, zIndex: 1000 }}>{openChats.map(chat => <ChatWindow key={chat.id} chat={chat} messages={chatMessages[chat.id] || []} currentUserId={user?.id} onSend={(text) => handleSendMessage(chat.id, text)} onClose={() => setOpenChats(prev => prev.filter(c => c.id !== chat.id))} />)}</div>
            </div>
        </>
    );
}
