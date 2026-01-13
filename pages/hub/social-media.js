/**
 * SMARTER.POKER SOCIAL HUB - Full Sngine Reconstruction
 * Light Theme + Working Supabase Integration
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Light Theme Colors (Facebook-style)
const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', red: '#FA383E',
};

const timeAgo = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

function Avatar({ src, name, size = 40, online }) {
    const init = name?.[0]?.toUpperCase() || '?';
    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            {src ? <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: size, height: size, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: size * 0.4 }}>{init}</div>}
            {online !== undefined && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: online ? C.green : '#ccc', border: '2px solid white' }} />}
        </div>
    );
}

function StoriesBar({ currentUser, onAddStory }) {
    return (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 0', marginBottom: 1 }}>
            <div onClick={onAddStory} style={{ minWidth: 110, height: 190, borderRadius: 12, background: C.card, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', cursor: 'pointer', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <div style={{ height: '75%', background: currentUser?.avatar ? `url(${currentUser.avatar}) center/cover` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }} />
                <div style={{ height: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -16, width: 32, height: 32, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, border: '3px solid white' }}>+</div>
                    <span style={{ fontSize: 12, fontWeight: 500, marginTop: 8 }}>Create Story</span>
                </div>
            </div>
        </div>
    );
}

function PostCreator({ user, onPost, isPosting }) {
    const [content, setContent] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const fileRef = useRef(null);

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length || !user?.id) return;
        setUploading(true);
        setError('');
        const uploaded = [];
        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const path = `${isVideo ? 'videos' : 'photos'}/${user.id}/${Date.now()}_${file.name}`;
            const { error: upErr } = await supabase.storage.from('social-media').upload(path, file);
            if (!upErr) {
                const { data } = supabase.storage.from('social-media').getPublicUrl(path);
                uploaded.push({ type: isVideo ? 'video' : 'photo', url: data.publicUrl });
            }
        }
        setMedia(prev => [...prev, ...uploaded]);
        setUploading(false);
    };

    const handlePost = async () => {
        if (!content.trim() && !media.length) return;
        setError('');
        const urls = media.map(m => m.url);
        const type = media.some(m => m.type === 'video') ? 'video' : media.length ? 'photo' : 'text';
        const ok = await onPost(content, urls, type);
        if (ok) { setContent(''); setMedia([]); }
        else setError('Unable to post at this time. Please try again later.');
    };

    return (
        <div style={{ background: C.card, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2 }}>
            <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                <Avatar src={user?.avatar} name={user?.name} size={40} />
                <input value={content} onChange={e => setContent(e.target.value)} placeholder={`What's on your mind, ${user?.name || 'Player'}?`}
                    style={{ flex: 1, background: C.bg, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 16, outline: 'none' }} />
            </div>
            {media.length > 0 && (
                <div style={{ padding: '0 12px 8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {media.map((m, i) => (
                        <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 8, overflow: 'hidden' }}>
                            {m.type === 'video' ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 10 }}>✕</button>
                        </div>
                    ))}
                </div>
            )}
            {error && <div style={{ padding: '0 12px 8px', color: C.red, fontSize: 13 }}>⚠️ {error}</div>}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFiles} />
                    <button onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}>{uploading ? '⏳' : '🖼️'} Photo/Video</button>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}>📺 Live</button>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}>🃏 Share Hand</button>
                </div>
                <button onClick={handlePost} disabled={isPosting || (!content.trim() && !media.length)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: C.blue, color: 'white', fontWeight: 600, cursor: 'pointer', opacity: isPosting || (!content.trim() && !media.length) ? 0.5 : 1 }}>Post</button>
            </div>
        </div>
    );
}

function PostCard({ post, currentUserId, currentUserName, onLike, onDelete, onComment }) {
    const [liked, setLiked] = useState(post.isLiked);
    const [likeCount, setLikeCount] = useState(post.likeCount);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentCount, setCommentCount] = useState(post.commentCount || 0);

    const handleLike = async () => {
        const newLiked = !liked;
        setLiked(newLiked);
        setLikeCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
        await onLike(post.id, newLiked ? 'like' : null);
    };

    const loadComments = async () => {
        if (comments.length > 0) return;
        setLoadingComments(true);
        try {
            const { data } = await supabase.from('social_comments')
                .select('id, content, created_at, author_id')
                .eq('post_id', post.id)
                .order('created_at', { ascending: true })
                .limit(20);
            if (data) setComments(data.map(c => ({ id: c.id, text: c.content, authorName: 'Player', authorId: c.author_id, time: timeAgo(c.created_at) })));
        } catch (e) { console.error(e); }
        setLoadingComments(false);
    };

    const handleToggleComments = () => {
        setShowComments(!showComments);
        if (!showComments) loadComments();
    };

    const handleSubmitComment = async () => {
        if (!newComment.trim() || !currentUserId) return;
        try {
            const { data, error } = await supabase.from('social_comments').insert({ post_id: post.id, author_id: currentUserId, content: newComment }).select('id, content, created_at').single();
            if (!error && data) {
                setComments(prev => [...prev, { id: data.id, text: data.content, authorName: 'You', authorId: currentUserId, time: 'Just now' }]);
                setCommentCount(prev => prev + 1);
                setNewComment('');
                if (onComment) onComment(post.id);
            }
        } catch (e) { console.error(e); }
    };

    return (
        <div style={{ background: C.card, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, overflow: 'hidden' }}>
            <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar src={post.author?.avatar} name={post.author?.name} size={40} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: C.text }}>{post.author?.name || 'Player'}</div>
                    <div style={{ fontSize: 12, color: C.textSec }}>{post.timeAgo}</div>
                </div>
                {post.authorId === currentUserId && <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 16 }}>⋯</button>}
            </div>
            {post.content && <div style={{ padding: '0 12px 12px', color: C.text, fontSize: 15, lineHeight: 1.4 }}>{post.content}</div>}
            {post.mediaUrls?.length > 0 && (
                <div>{post.contentType === 'video' ? <video controls style={{ width: '100%', display: 'block' }} src={post.mediaUrls[0]} /> : <img src={post.mediaUrls[0]} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />}</div>
            )}
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', color: C.textSec, fontSize: 13 }}>
                <span>{likeCount > 0 && `👍 ${likeCount}`}</span>
                <span style={{ cursor: 'pointer' }} onClick={handleToggleComments}>{commentCount > 0 && `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}</span>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex' }}>
                <button onClick={handleLike} style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: liked ? C.blue : C.textSec, fontWeight: 500, fontSize: 13 }}>👍 {liked ? 'Liked' : 'Like'}</button>
                <button onClick={handleToggleComments} style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: showComments ? C.blue : C.textSec, fontWeight: 500, fontSize: 13 }}>💬 Comment</button>
                <button style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontWeight: 500, fontSize: 13 }}>↗️ Share</button>
            </div>
            {showComments && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
                    {loadingComments && <div style={{ color: C.textSec, fontSize: 13 }}>Loading comments...</div>}
                    {comments.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <Avatar name={c.authorName} size={28} />
                            <div style={{ flex: 1, background: C.bg, borderRadius: 12, padding: '6px 10px' }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.authorName}</div>
                                <div style={{ fontSize: 14, color: C.text }}>{c.text}</div>
                            </div>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Avatar name={currentUserName} size={28} />
                        <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSubmitComment()} placeholder="Write a comment..." style={{ flex: 1, padding: '8px 14px', borderRadius: 18, border: 'none', background: C.bg, fontSize: 14, outline: 'none' }} />
                        <button onClick={handleSubmitComment} disabled={!newComment.trim()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: newComment.trim() ? C.blue : C.textSec, fontWeight: 600, fontSize: 13 }}>Post</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ChatWindow({ chat, messages, currentUserId, onSend, onClose }) {
    const [text, setText] = useState('');
    const endRef = useRef(null);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const send = async () => {
        if (!text.trim()) return;
        await onSend(text);
        setText('');
    };

    return (
        <div style={{ width: 328, height: 400, background: C.card, borderRadius: '8px 8px 0 0', boxShadow: '0 -2px 8px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}` }}>
            <div style={{ padding: 8, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar src={chat.avatar} name={chat.name} size={32} online={chat.online} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{chat.name}</div></div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: m.senderId === currentUserId ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '70%', padding: '6px 10px', borderRadius: 16, background: m.senderId === currentUserId ? C.blue : C.bg, color: m.senderId === currentUserId ? 'white' : C.text, fontSize: 14 }}>{m.text}</div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
            <div style={{ padding: 8, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
                <input value={text} onChange={e => setText(e.target.value)} onKeyPress={e => e.key === 'Enter' && send()} placeholder="Aa" style={{ flex: 1, padding: '6px 12px', borderRadius: 18, border: 'none', background: C.bg, fontSize: 14, outline: 'none' }} />
                <button onClick={send} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontSize: 16 }}>➤</button>
            </div>
        </div>
    );
}

function ContactsSidebar({ contacts, onOpenChat, onSearch, searchResults }) {
    const [q, setQ] = useState('');
    return (
        <aside style={{ width: 200, position: 'sticky', top: 70, height: 'fit-content' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: C.textSec }}>Contacts</h4>
            <input value={q} onChange={e => { setQ(e.target.value); onSearch(e.target.value); }} placeholder="🔍 Search..." style={{ width: '100%', padding: '8px 10px', borderRadius: 20, border: 'none', background: C.bg, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
            {q.length >= 2 && searchResults.length > 0 && searchResults.map(u => (
                <div key={u.id} onClick={() => onOpenChat(u)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}>
                    <Avatar name={u.username} size={32} /><span style={{ fontSize: 13 }}>{u.username}</span>
                </div>
            ))}
            {contacts.length === 0 ? <p style={{ color: C.textSec, fontSize: 12, textAlign: 'left', margin: 0 }}>No contacts yet</p> : contacts.map(c => (
                <div key={c.id} onClick={() => onOpenChat(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}>
                    <Avatar src={c.avatar} name={c.name} size={36} online={c.online} /><span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                </div>
            ))}
        </aside>
    );
}

export default function SocialMediaPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [openChats, setOpenChats] = useState([]);
    const [chatMsgs, setChatMsgs] = useState({});
    const [isPosting, setIsPosting] = useState(false);
    const searchTimeout = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const { data: { user: au } } = await supabase.auth.getUser();
                if (au) {
                    const { data: p } = await supabase.from('profiles').select('username, skill_tier').eq('id', au.id).maybeSingle();
                    setUser({ id: au.id, name: p?.username || au.email?.split('@')[0] || 'Player', avatar: null, tier: p?.skill_tier });
                    await loadContacts(au.id);
                }
                await loadFeed();
            } catch (e) { console.error(e); }
            setLoading(false);
        })();
    }, []);

    const loadFeed = async () => {
        try {
            const { data, error } = await supabase.from('social_posts')
                .select('id, content, content_type, media_urls, like_count, comment_count, share_count, created_at, author_id')
                .or('visibility.eq.public,visibility.is.null')
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            if (data) {
                const authorIds = [...new Set(data.map(p => p.author_id).filter(Boolean))];
                let authorMap = {};
                if (authorIds.length) {
                    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', authorIds);
                    if (profiles) authorMap = Object.fromEntries(profiles.map(p => [p.id, p]));
                }
                setPosts(data.map(p => ({
                    id: p.id, authorId: p.author_id, content: p.content, contentType: p.content_type,
                    mediaUrls: p.media_urls || [], likeCount: p.like_count || 0, commentCount: p.comment_count || 0,
                    shareCount: p.share_count || 0, timeAgo: timeAgo(p.created_at), isLiked: false,
                    author: { name: authorMap[p.author_id]?.username || 'Player', avatar: null }
                })));
            }
        } catch (e) { console.error('Feed error:', e); }
    };

    const handlePost = async (content, urls, type) => {
        if (!user?.id) return false;
        setIsPosting(true);
        try {
            const { data, error } = await supabase.from('social_posts').insert({
                author_id: user.id, content, content_type: type, media_urls: urls, visibility: 'public'
            }).select().single();
            if (error) throw error;
            setPosts(prev => [{ id: data.id, authorId: user.id, content, contentType: type, mediaUrls: urls, likeCount: 0, commentCount: 0, shareCount: 0, timeAgo: 'Just now', isLiked: false, author: { name: user.name, avatar: user.avatar } }, ...prev]);
            return true;
        } catch (e) { console.error('Post error:', e); return false; }
        finally { setIsPosting(false); }
    };

    const handleLike = async (postId, type) => {
        if (!user?.id) return;
        try {
            if (!type) {
                await supabase.from('social_interactions').delete().eq('post_id', postId).eq('user_id', user.id).eq('interaction_type', 'like');
            } else {
                await supabase.from('social_interactions').upsert(
                    { post_id: postId, user_id: user.id, interaction_type: 'like' },
                    { onConflict: 'user_id,post_id,interaction_type' }
                );
            }
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id) => {
        if (!user?.id || !confirm('Delete?')) return;
        try { await supabase.from('social_posts').delete().eq('id', id); setPosts(prev => prev.filter(p => p.id !== id)); } catch (e) { console.error(e); }
    };

    const loadContacts = async (userId) => {
        try {
            const { data } = await supabase.from('social_conversation_participants').select('conversation_id, social_conversations(last_message_preview)').eq('user_id', userId);
            if (!data) return;
            const list = await Promise.all(data.map(async c => {
                const { data: parts } = await supabase.from('social_conversation_participants').select('user_id').eq('conversation_id', c.conversation_id).neq('user_id', userId);
                if (!parts?.[0]) return null;
                const { data: prof } = await supabase.from('profiles').select('username').eq('id', parts[0].user_id).maybeSingle();
                return { id: parts[0].user_id, name: prof?.username || 'Player', avatar: null, conversationId: c.conversation_id, lastMessage: c.social_conversations?.last_message_preview, online: false };
            }));
            setContacts(list.filter(Boolean));
        } catch (e) { console.error(e); }
    };

    const handleSearch = (q) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (q.length < 2) { setSearchResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            try {
                const { data } = await supabase.from('profiles').select('id, username').ilike('username', `%${q}%`).limit(10);
                if (data) setSearchResults(data.map(u => ({ id: u.id, username: u.username })));
            } catch (e) { console.error(e); }
        }, 300);
    };

    const handleOpenChat = async (c) => {
        if (openChats.find(x => x.id === c.id)) return;
        let convId = c.conversationId;
        if (!convId && user?.id) {
            try {
                const { data } = await supabase.rpc('fn_get_or_create_conversation', { user1_id: user.id, user2_id: c.id });
                convId = data;
            } catch (e) { console.error(e); }
        }
        const chat = { id: c.id, name: c.name || c.username, avatar: null, online: false, conversationId: convId };
        setOpenChats(prev => [...prev.slice(-2), chat]);
        if (convId) {
            try {
                const { data } = await supabase.from('social_messages').select('id, content, sender_id').eq('conversation_id', convId).eq('is_deleted', false).order('created_at', { ascending: true }).limit(50);
                if (data) setChatMsgs(prev => ({ ...prev, [c.id]: data.map(m => ({ id: m.id, text: m.content, senderId: m.sender_id })) }));
            } catch (e) { console.error(e); }
        }
    };

    const handleSendMsg = async (cid, txt) => {
        const chat = openChats.find(x => x.id === cid);
        if (!chat?.conversationId || !user?.id) return;
        try {
            await supabase.rpc('fn_send_message', { p_conversation_id: chat.conversationId, p_sender_id: user.id, p_content: txt });
            setChatMsgs(prev => ({ ...prev, [cid]: [...(prev[cid] || []), { id: Date.now(), text: txt, senderId: user.id }] }));
        } catch (e) { console.error(e); }
    };

    if (loading) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div>Loading...</div></div>;

    return (
        <>
            <Head><title>Social Hub | Smarter.Poker</title></Head>
            <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                <header style={{ background: C.card, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    <Link href="/hub" style={{ fontSize: 14, color: C.textSec, textDecoration: 'none' }}>← Hub</Link>
                    <div style={{ fontWeight: 700, fontSize: 20, color: C.red }}>🔴 Social</div>
                    {user ? <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 20, cursor: 'pointer' }}>🔔</span><span style={{ fontSize: 20, cursor: 'pointer' }}>💬</span><Avatar name={user.name} size={36} /></div> : <Link href="/auth/login" style={{ color: C.blue, fontWeight: 600, textDecoration: 'none' }}>Log In</Link>}
                </header>
                <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', maxWidth: 900, margin: '0 auto', gap: 16, padding: 16 }}>
                    <nav style={{ position: 'sticky', top: 70, height: 'fit-content' }}>
                        {user && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer' }}><Avatar name={user.name} size={32} /><span style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</span></div>}
                        {['👤 Profile', '👥 Friends', '🏛️ Clubs', '📺 Watch', '🏆 Tournaments', '🎯 GTO Training', '🌐 Full Social Site'].map((item, i) => <div key={i} style={{ padding: '8px 0', cursor: 'pointer', color: C.textSec, fontSize: 14 }}>{item}</div>)}
                        <ContactsSidebar contacts={contacts} onOpenChat={handleOpenChat} onSearch={handleSearch} searchResults={searchResults} />
                    </nav>
                    <main>
                        <StoriesBar currentUser={user} onAddStory={() => { }} />
                        {user && <PostCreator user={user} onPost={handlePost} isPosting={isPosting} />}
                        {!user && <div style={{ background: C.card, borderRadius: 8, padding: 20, textAlign: 'center', marginBottom: 2 }}><p style={{ color: C.textSec }}>Log in to post and chat!</p><Link href="/auth/login" style={{ color: C.blue, fontWeight: 600, textDecoration: 'none' }}>Log In →</Link></div>}
                        {posts.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}><div style={{ fontSize: 48 }}>🌟</div><h3 style={{ color: C.text }}>No posts yet</h3><p>Be the first to share something!</p></div> : posts.map(p => <PostCard key={p.id} post={p} currentUserId={user?.id} currentUserName={user?.name} onLike={handleLike} onDelete={handleDelete} />)}
                    </main>
                </div>
                <div style={{ position: 'fixed', bottom: 0, right: 80, display: 'flex', gap: 8, zIndex: 1000 }}>{openChats.map(ch => <ChatWindow key={ch.id} chat={ch} messages={chatMsgs[ch.id] || []} currentUserId={user?.id} onSend={txt => handleSendMsg(ch.id, txt)} onClose={() => setOpenChats(prev => prev.filter(x => x.id !== ch.id))} />)}</div>
            </div>
        </>
    );
}
