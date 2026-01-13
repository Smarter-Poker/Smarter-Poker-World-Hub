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
    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
                src={src || '/default-avatar.png'}
                alt={name || 'User'}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
            />
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

const MAX_MEDIA = 10;

function PostCreator({ user, onPost, isPosting }) {
    const [content, setContent] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionResults, setMentionResults] = useState([]);
    const [showMentions, setShowMentions] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    const fileRef = useRef(null);
    const inputRef = useRef(null);
    const mentionTimeout = useRef(null);

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length || !user?.id) return;

        // Check total media limit
        const remaining = MAX_MEDIA - media.length;
        if (remaining <= 0) {
            setError(`Maximum ${MAX_MEDIA} images/videos allowed per post`);
            return;
        }
        const filesToUpload = files.slice(0, remaining);
        if (files.length > remaining) {
            setError(`Only ${remaining} more file(s) can be added (max ${MAX_MEDIA})`);
        }

        setUploading(true);
        const uploaded = [];
        for (const file of filesToUpload) {
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

    // Handle @mention detection
    const handleContentChange = (e) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;
        setContent(value);
        setCursorPosition(pos);

        // Check for @mention pattern
        const textBeforeCursor = value.substring(0, pos);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

        if (mentionMatch) {
            const query = mentionMatch[1];
            setMentionQuery(query);
            setShowMentions(true);

            // Search for users
            if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
            if (query.length >= 1) {
                mentionTimeout.current = setTimeout(async () => {
                    try {
                        const { data } = await supabase.from('profiles')
                            .select('id, username, full_name')
                            .ilike('username', `%${query}%`)
                            .limit(5);
                        if (data) setMentionResults(data);
                    } catch (e) { console.error(e); }
                }, 200);
            }
        } else {
            setShowMentions(false);
            setMentionResults([]);
        }
    };

    const insertMention = (user) => {
        const textBeforeCursor = content.substring(0, cursorPosition);
        const textAfterCursor = content.substring(cursorPosition);
        const mentionStart = textBeforeCursor.lastIndexOf('@');
        const newContent = textBeforeCursor.substring(0, mentionStart) + `@${user.username} ` + textAfterCursor;
        setContent(newContent);
        setShowMentions(false);
        setMentionResults([]);
        inputRef.current?.focus();
    };

    const handlePost = async () => {
        if (!content.trim() && !media.length) return;
        setError('');
        const urls = media.map(m => m.url);
        const type = media.some(m => m.type === 'video') ? 'video' : media.length ? 'photo' : 'text';

        // Extract mentions from content
        const mentionPattern = /@(\w+)/g;
        const mentions = [];
        let match;
        while ((match = mentionPattern.exec(content)) !== null) {
            mentions.push(match[1]);
        }

        const ok = await onPost(content, urls, type, mentions);
        if (ok) { setContent(''); setMedia([]); }
        else setError('Unable to post at this time. Please try again later.');
    };

    return (
        <div style={{ background: C.card, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, position: 'relative' }}>
            <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                <Avatar src={user?.avatar} name={user?.name} size={40} />
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        ref={inputRef}
                        value={content}
                        onChange={handleContentChange}
                        placeholder={`What's on your mind, ${user?.name || 'Player'}? Use @ to tag friends`}
                        style={{ width: '100%', background: C.bg, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
                    />
                    {/* @Mention Dropdown */}
                    {showMentions && mentionResults.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                            background: C.card, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            border: `1px solid ${C.border}`, zIndex: 1000, maxHeight: 200, overflowY: 'auto'
                        }}>
                            {mentionResults.map(u => (
                                <div
                                    key={u.id}
                                    onClick={() => insertMention(u)}
                                    style={{
                                        padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                        borderBottom: `1px solid ${C.border}`, transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Avatar name={u.username} size={32} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>@{u.username}</div>
                                        {u.full_name && <div style={{ fontSize: 12, color: C.textSec }}>{u.full_name}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {/* Media Preview Grid */}
            {media.length > 0 && (
                <div style={{ padding: '0 12px 8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: media.length === 1 ? '1fr' : media.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 4 }}>
                        {media.map((m, i) => (
                            <div key={i} style={{ position: 'relative', aspectRatio: media.length === 1 ? '16/9' : '1', borderRadius: 8, overflow: 'hidden' }}>
                                {m.type === 'video' ? (
                                    <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                <button
                                    onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))}
                                    style={{
                                        position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer',
                                        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >✕</button>
                                {m.type === 'video' && (
                                    <div style={{
                                        position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.7)',
                                        padding: '2px 6px', borderRadius: 4, color: 'white', fontSize: 10
                                    }}>VIDEO</div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{media.length}/{MAX_MEDIA} files</div>
                </div>
            )}
            {error && <div style={{ padding: '0 12px 8px', color: C.red, fontSize: 13 }}>⚠️ {error}</div>}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFiles} />
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={media.length >= MAX_MEDIA}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6,
                            border: 'none', background: 'transparent', cursor: media.length >= MAX_MEDIA ? 'not-allowed' : 'pointer',
                            color: media.length >= MAX_MEDIA ? '#ccc' : C.textSec, fontSize: 13
                        }}
                    >{uploading ? '⏳' : '🖼️'} Photo/Video</button>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}>📺 Live</button>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}>🃏 Share Hand</button>
                    <button
                        onClick={() => { setContent(prev => prev + ' @'); inputRef.current?.focus(); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}
                    >👤 Tag</button>
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
            {post.content && (
                <div style={{ padding: '0 12px 12px', color: C.text, fontSize: 15, lineHeight: 1.4 }}>
                    {post.content.split(/(@\w+)/g).map((part, i) =>
                        part.startsWith('@') ?
                            <span key={i} style={{ color: C.blue, fontWeight: 500, cursor: 'pointer' }}>{part}</span> :
                            part
                    )}
                </div>
            )}
            {/* Media Grid - supports up to 10 images/videos */}
            {post.mediaUrls?.length > 0 && (
                <div style={{ padding: post.mediaUrls.length > 1 ? '0 2px 2px' : 0 }}>
                    {post.mediaUrls.length === 1 ? (
                        // Single media - full width
                        post.contentType === 'video' ? (
                            <video controls style={{ width: '100%', display: 'block' }} src={post.mediaUrls[0]} />
                        ) : (
                            <img src={post.mediaUrls[0]} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
                        )
                    ) : post.mediaUrls.length === 2 ? (
                        // 2 media - side by side
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                            {post.mediaUrls.map((url, i) => (
                                <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                    {post.contentType === 'video' && i === 0 ? (
                                        <video controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} src={url} />
                                    ) : (
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : post.mediaUrls.length === 3 ? (
                        // 3 media - 1 large + 2 small
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
                            <div style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                <img src={post.mediaUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {post.mediaUrls.slice(1).map((url, i) => (
                                    <div key={i} style={{ flex: 1, overflow: 'hidden' }}>
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : post.mediaUrls.length === 4 ? (
                        // 4 media - 2x2 grid
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                            {post.mediaUrls.map((url, i) => (
                                <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        // 5+ media - 2 large + rest in row with +N overlay
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 2 }}>
                                {post.mediaUrls.slice(0, 2).map((url, i) => (
                                    <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                                {post.mediaUrls.slice(2, 5).map((url, i) => (
                                    <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        {i === 2 && post.mediaUrls.length > 5 && (
                                            <div style={{
                                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontSize: 24, fontWeight: 600
                                            }}>+{post.mediaUrls.length - 5}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
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
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [bottomNavVisible, setBottomNavVisible] = useState(true);
    const searchTimeout = useRef(null);
    const lastScrollY = useRef(0);

    // Hide bottom nav when scrolling up, show when scrolling down
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                // Scrolling down - hide nav
                setBottomNavVisible(false);
            } else {
                // Scrolling up - show nav
                setBottomNavVisible(true);
            }
            lastScrollY.current = currentScrollY;
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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

    const handlePost = async (content, urls, type, mentions = []) => {
        if (!user?.id) return false;
        setIsPosting(true);
        try {
            const { data, error } = await supabase.from('social_posts').insert({
                author_id: user.id, content, content_type: type, media_urls: urls, visibility: 'public'
            }).select().single();
            if (error) throw error;

            // Insert mentions if any
            if (mentions.length > 0 && data?.id) {
                // Look up user IDs for mentioned usernames
                const { data: mentionedUsers } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('username', mentions);

                if (mentionedUsers?.length > 0) {
                    const mentionInserts = mentionedUsers.map(u => ({
                        post_id: data.id,
                        mentioned_user_id: u.id,
                        mentioned_by_id: user.id
                    }));
                    await supabase.from('mentions').insert(mentionInserts);
                }
            }

            setPosts(prev => [{
                id: data.id, authorId: user.id, content, contentType: type,
                mediaUrls: urls, likeCount: 0, commentCount: 0, shareCount: 0,
                timeAgo: 'Just now', isLiked: false,
                author: { name: user.name, avatar: user.avatar }
            }, ...prev]);
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

            {/* Slide-out Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 999
                    }}
                />
            )}

            {/* Slide-out Sidebar Panel */}
            <div style={{
                position: 'fixed', top: 0, left: 0, bottom: 0, width: 320,
                background: C.card, zIndex: 1000, boxShadow: '2px 0 10px rgba(0,0,0,0.2)',
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.3s ease',
                overflowY: 'auto', paddingBottom: 80
            }}>
                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
                    <button onClick={() => setSidebarOpen(false)} style={{
                        background: '#f0f0f0', border: 'none', width: 32, height: 32,
                        borderRadius: '50%', cursor: 'pointer', fontSize: 16
                    }}>✕</button>
                </div>

                {/* User Profile Card */}
                {user && (
                    <Link href="/hub/profile" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', margin: '0 12px 16px',
                        background: C.card, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        textDecoration: 'none', color: 'inherit'
                    }}>
                        <Avatar src={user.avatar} name={user.name} size={48} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 17 }}>{user.name}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>View your profile</div>
                        </div>
                        <div style={{
                            background: C.blue, color: 'white', borderRadius: '50%',
                            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 600
                        }}>9+</div>
                    </Link>
                )}

                {/* Your Shortcuts */}
                <div style={{ padding: '0 16px', marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: C.textSec, marginBottom: 12 }}>Your shortcuts</h4>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Link href="/hub/club-arena" onClick={() => setSidebarOpen(false)} style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
                            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏛</div>
                            <div style={{ fontSize: 11, marginTop: 4, color: C.textSec }}>Club Arena</div>
                        </Link>
                        <Link href="/hub" onClick={() => setSidebarOpen(false)} style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
                            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎮</div>
                            <div style={{ fontSize: 11, marginTop: 4, color: C.textSec }}>Games Hub</div>
                        </Link>
                    </div>
                </div>

                {/* Menu Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 16 }}>
                    {[
                        { icon: '👤', label: 'Profile', href: '/hub/profile' },
                        { icon: '👥', label: 'Friends', href: '/hub/friends' },
                        { icon: '🏛️', label: 'Clubs', href: '/hub/club-arena' },
                        { icon: '💎', label: 'Diamond Store', href: '/hub/diamond-store' },
                        { icon: '🏆', label: 'Tournaments', href: '/hub/tournaments' },
                        { icon: '🎯', label: 'GTO Training', href: '/hub/gto-trainer' },
                        { icon: '📺', label: 'Watch', href: '/hub/watch' },
                        { icon: '⚙️', label: 'Settings', href: '/hub/settings' },
                    ].map((item, i) => (
                        <Link key={i} href={item.href} onClick={() => setSidebarOpen(false)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                            padding: 12, background: '#f7f8fa', borderRadius: 8,
                            textDecoration: 'none', color: C.text
                        }}>
                            <span style={{ fontSize: 24, marginBottom: 4 }}>{item.icon}</span>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                        </Link>
                    ))}
                </div>

                {/* See More */}
                <div style={{ padding: '0 16px', marginBottom: 16 }}>
                    <button style={{
                        width: '100%', padding: 12, background: '#e4e6eb', border: 'none',
                        borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                    }}>See more</button>
                </div>

                {/* Bottom Links */}
                <div style={{ padding: '0 16px' }}>
                    <div style={{ padding: '12px 0', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <span style={{ fontSize: 20, opacity: 0.6 }}>❓</span>
                        <span style={{ flex: 1, fontSize: 15 }}>Help & support</span>
                        <span style={{ color: C.textSec }}>›</span>
                    </div>
                    <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <span style={{ fontSize: 20, opacity: 0.6 }}>⚙️</span>
                        <span style={{ flex: 1, fontSize: 15 }}>Settings & privacy</span>
                        <span style={{ color: C.textSec }}>›</span>
                    </div>
                </div>
            </div>

            <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', paddingBottom: 70 }}>
                {/* Header */}
                <header style={{ background: C.card, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    {/* LEFT: Hamburger + Logo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            onClick={() => setSidebarOpen(true)}
                            style={{
                                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 40, height: 40, borderRadius: 8
                            }}
                        >☰</button>
                        <Link href="/hub" style={{ fontWeight: 700, fontSize: 22, color: C.blue, textDecoration: 'none' }}>Smarter.Poker</Link>
                    </div>

                    {/* RIGHT: Create, Search, Messenger */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button style={{
                            width: 36, height: 36, borderRadius: '50%', background: '#e4e6eb',
                            border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex',
                            alignItems: 'center', justifyContent: 'center'
                        }}>+</button>
                        <button style={{
                            width: 36, height: 36, borderRadius: '50%', background: '#e4e6eb',
                            border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex',
                            alignItems: 'center', justifyContent: 'center'
                        }}>🔍</button>
                        <button style={{
                            width: 36, height: 36, borderRadius: '50%', background: '#e4e6eb',
                            border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex',
                            alignItems: 'center', justifyContent: 'center'
                        }}>💬</button>
                    </div>
                </header>

                {/* Main Feed - Full Width */}
                <main style={{ maxWidth: 680, margin: '0 auto', padding: '8px' }}>
                    {/* Post Creator - "What's on your mind?" */}
                    {user && (
                        <div style={{
                            background: C.card, borderRadius: 8, padding: 12, marginBottom: 8,
                            display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                            <Avatar src={user.avatar} name={user.name} size={40} />
                            <div
                                onClick={() => document.querySelector('textarea')?.focus()}
                                style={{
                                    flex: 1, padding: '10px 16px', background: '#f0f2f5',
                                    borderRadius: 20, color: C.textSec, cursor: 'pointer', fontSize: 15
                                }}
                            >What's on your mind?</div>
                            <button style={{
                                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', opacity: 0.5
                            }}>🖼</button>
                        </div>
                    )}

                    {/* Stories Bar */}
                    <StoriesBar currentUser={user} onAddStory={() => { }} />

                    {/* Full Post Creator (hidden by default, shown when clicked) */}
                    {user && <PostCreator user={user} onPost={handlePost} isPosting={isPosting} />}

                    {/* Login prompt */}
                    {!user && (
                        <div style={{ background: C.card, borderRadius: 8, padding: 24, textAlign: 'center', marginBottom: 8 }}>
                            <p style={{ color: C.textSec, marginBottom: 12 }}>Log in to post and interact!</p>
                            <Link href="/auth/login" style={{
                                display: 'inline-block', padding: '10px 24px', background: C.blue,
                                color: 'white', borderRadius: 6, fontWeight: 600, textDecoration: 'none'
                            }}>Log In</Link>
                        </div>
                    )}

                    {/* Posts Feed */}
                    {posts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ fontSize: 48 }}>🌟</div>
                            <h3 style={{ color: C.text }}>No posts yet</h3>
                            <p>Be the first to share something!</p>
                        </div>
                    ) : (
                        posts.map(p => <PostCard key={p.id} post={p} currentUserId={user?.id} currentUserName={user?.name} onLike={handleLike} onDelete={handleDelete} />)
                    )}
                </main>

                {/* Bottom Navigation Bar */}
                <nav style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
                    background: C.card, borderTop: `1px solid ${C.border}`,
                    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
                    zIndex: 100,
                    transform: bottomNavVisible ? 'translateY(0)' : 'translateY(100%)',
                    transition: 'transform 0.3s ease'
                }}>
                    <Link href="/hub/social-media" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: C.blue }}>
                        <span style={{ fontSize: 24 }}>🏠</span>
                        <span style={{ fontSize: 10, marginTop: 2 }}>Home</span>
                    </Link>
                    <Link href="/hub/watch" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: C.textSec, position: 'relative' }}>
                        <span style={{ fontSize: 24 }}>📺</span>
                        <span style={{ fontSize: 10, marginTop: 2 }}>Reels</span>
                    </Link>
                    <Link href="/hub/friends" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: C.textSec, position: 'relative' }}>
                        <span style={{ fontSize: 24 }}>👥</span>
                        <div style={{ position: 'absolute', top: -2, right: -4, background: C.red, color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>1</div>
                        <span style={{ fontSize: 10, marginTop: 2 }}>Friends</span>
                    </Link>
                    <Link href="/hub/club-arena" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: C.textSec }}>
                        <span style={{ fontSize: 24 }}>🏛️</span>
                        <span style={{ fontSize: 10, marginTop: 2 }}>Clubs</span>
                    </Link>
                    <Link href="/hub/social-media?tab=notifications" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: C.textSec, position: 'relative' }}>
                        <span style={{ fontSize: 24 }}>🔔</span>
                        <div style={{ position: 'absolute', top: -2, right: -4, background: C.red, color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>1</div>
                        <span style={{ fontSize: 10, marginTop: 2 }}>Alerts</span>
                    </Link>
                    <Link href="/hub/profile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: C.textSec }}>
                        {user ? <Avatar src={user.avatar} name={user.name} size={28} /> : <span style={{ fontSize: 24 }}>👤</span>}
                        <span style={{ fontSize: 10, marginTop: 2 }}>Profile</span>
                    </Link>
                </nav>

                {/* Chat Windows */}
                <div style={{ position: 'fixed', bottom: 70, right: 16, display: 'flex', gap: 8, zIndex: 1000 }}>
                    {openChats.map(ch => <ChatWindow key={ch.id} chat={ch} messages={chatMsgs[ch.id] || []} currentUserId={user?.id} onSend={txt => handleSendMsg(ch.id, txt)} onClose={() => setOpenChats(prev => prev.filter(x => x.id !== ch.id))} />)}
                </div>
            </div>
        </>
    );
}
