/**
 * SMARTER.POKER SOCIAL HUB - Full Sngine Reconstruction
 * Light Theme + Working Supabase Integration + Go Live Streaming
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../src/lib/supabase';
import { useUnreadCount, UnreadBadge } from '../../src/hooks/useUnreadCount';
import { StoriesBar, ShareToStoryPrompt } from '../../src/components/social/Stories';
import { ReelsFeedCarousel } from '../../src/components/social/ReelsFeedCarousel';
import { GoLiveModal } from '../../src/components/social/GoLiveModal';
import { LiveStreamCard } from '../../src/components/social/LiveStreamCard';
import { LiveStreamViewer } from '../../src/components/social/LiveStreamViewer';
import LiveStreamService from '../../src/services/LiveStreamService';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';

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

function Avatar({ src, name, size = 40, online, onClick, linkTo }) {
    const router = useRouter();
    const handleClick = onClick || (linkTo ? () => router.push(linkTo) : null);

    return (
        <div
            style={{ position: 'relative', display: 'inline-block', cursor: handleClick ? 'pointer' : 'default' }}
            onClick={handleClick}
        >
            <img
                src={src || '/default-avatar.png'}
                alt={name || 'User'}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
            />
            {online !== undefined && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: online ? C.green : '#ccc', border: '2px solid white' }} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎬 YOUTUBE URL HELPERS - Detect and convert YouTube URLs for embedding
// ═══════════════════════════════════════════════════════════════════════════

function isYouTubeUrl(url) {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
}

function getYouTubeVideoId(url) {
    if (!url) return null;

    // Handle youtube.com/watch?v=VIDEO_ID
    const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];

    // Handle youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];

    // Handle youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) return embedMatch[1];

    return null;
}

function getYouTubeEmbedUrl(url) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
        // autoplay=1: Start playing immediately
        // rel=0: Don't show related videos at end
        // modestbranding=1: Minimal YouTube branding
        // playsinline=1: Play inline on mobile
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    }
    return url;
}

function getYouTubeThumbnail(url) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
        // Use hqdefault for reliable availability (maxresdefault not always available)
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎬 FULL SCREEN VIDEO VIEWER - TikTok/Reels style immersive viewer
// ═══════════════════════════════════════════════════════════════════════════

function FullScreenVideoViewer({ videoUrl, author, caption, onClose, onLike, onComment, onShare }) {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [showControls, setShowControls] = useState(true);

    useEffect(() => {
        // Auto-hide controls after 3 seconds
        const timer = setTimeout(() => setShowControls(false), 3000);
        return () => clearTimeout(timer);
    }, [showControls]);

    useEffect(() => {
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const togglePlay = () => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play();
                setIsPlaying(true);
            } else {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        }
    };

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: '#000', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setShowControls(true)}
        >
            {/* Close Button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 16, left: 16, zIndex: 10001,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
                    border: 'none', cursor: 'pointer', color: 'white', fontSize: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >✕</button>

            {/* Video Container - Detect YouTube URLs vs direct video files */}
            {isYouTubeUrl(videoUrl) ? (
                // YouTube embed - takes full screen
                <iframe
                    src={getYouTubeEmbedUrl(videoUrl)}
                    style={{
                        width: '100vw',
                        height: '95vh',
                        border: 'none'
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                />
            ) : (
                // Direct video file
                <video
                    ref={videoRef}
                    src={videoUrl}
                    autoPlay
                    loop
                    playsInline
                    onClick={togglePlay}
                    style={{
                        maxWidth: '100%', maxHeight: '100%',
                        width: 'auto', height: '100%',
                        objectFit: 'contain', cursor: 'pointer'
                    }}
                />
            )}

            {/* Play/Pause Overlay */}
            {!isPlaying && (
                <div
                    onClick={togglePlay}
                    style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 36, color: 'white'
                    }}
                >▶</div>
            )}

            {/* Author Info & Caption Overlay */}
            <div style={{
                position: 'absolute', bottom: 80, left: 16, right: 80,
                color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                opacity: showControls ? 1 : 0.7,
                transition: 'opacity 0.3s'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <img
                        src={author?.avatar || '/default-avatar.png'}
                        alt={author?.name}
                        style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{author?.name || 'Player'}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>Smarter.Poker</div>
                    </div>
                </div>
                {caption && (
                    <div style={{ fontSize: 14, lineHeight: 1.4, maxHeight: 80, overflow: 'hidden' }}>
                        {caption}
                    </div>
                )}
            </div>

            {/* Right Side Engagement Buttons */}
            <div style={{
                position: 'absolute', right: 16, bottom: 120,
                display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center'
            }}>
                <button onClick={onLike} style={{
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                    border: 'none', borderRadius: '50%', width: 48, height: 48,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', fontSize: 22
                }}>❤️</button>

                <button onClick={onComment} style={{
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                    border: 'none', borderRadius: '50%', width: 48, height: 48,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', fontSize: 22
                }}>💬</button>

                <button onClick={onShare} style={{
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                    border: 'none', borderRadius: '50%', width: 48, height: 48,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', fontSize: 22
                }}>↗️</button>
            </div>

            {/* Bottom Gradient */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 200,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                pointerEvents: 'none'
            }} />
        </div>
    );
}

// StoriesBar imported from '../../src/components/social/Stories'

const MAX_MEDIA = 10;

function PostCreator({ user, onPost, isPosting, onGoLive }) {
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
        let urls = media.map(m => m.url);
        let type = media.some(m => m.type === 'video') ? 'video' : media.length ? 'photo' : 'text';
        let cleanContent = content;

        // 🎬 AUTO-DETECT YOUTUBE URLs in content and convert to video post
        const youtubeRegex = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g;
        const youtubeMatch = content.match(youtubeRegex);

        // 🔗 AUTO-DETECT ANY URL for link preview (Facebook-style)
        const generalUrlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = content.match(generalUrlRegex);

        if (youtubeMatch && type === 'text') {
            // Found a YouTube URL - convert to video post
            const fullUrl = youtubeMatch[0].startsWith('http') ? youtubeMatch[0] : `https://${youtubeMatch[0]}`;
            urls = [fullUrl];
            type = 'video';
            // 🎯 FACEBOOK-STYLE: Remove the URL from content text
            cleanContent = content.replace(youtubeRegex, '').trim();
        } else if (urlMatch && type === 'text') {
            // Found a general URL - convert to link post
            urls = [urlMatch[0]];
            type = 'link';
            // 🎯 FACEBOOK-STYLE: Remove the URL from content text
            cleanContent = content.replace(generalUrlRegex, '').trim();
        }

        // Extract mentions from content
        const mentionPattern = /@(\w+)/g;
        const mentions = [];
        let match;
        while ((match = mentionPattern.exec(content)) !== null) {
            mentions.push(match[1]);
        }

        const ok = await onPost(cleanContent, urls, type, mentions);
        if (ok) { setContent(''); setMedia([]); }
        else setError('Unable to post at this time. Please try again later.');
    };

    return (
        <div style={{ background: C.card, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, position: 'relative' }}>
            <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                <Link href="/hub/profile" style={{ display: 'block', cursor: 'pointer' }}>
                    <Avatar src={user?.avatar} name={user?.name} size={40} />
                </Link>
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        ref={inputRef}
                        value={content}
                        onChange={handleContentChange}
                        placeholder={`What's on your mind, ${user?.name || 'Player'}?`}
                        style={{ width: '100%', background: C.bg, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 16, outline: 'none', boxSizing: 'border-box', color: C.text }}
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
                    <button onClick={onGoLive} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}>📺 Live</button>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontSize: 13 }}>🃏 Share Hand</button>
                    <Link
                        href="/hub/reels"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
                            border: 'none', background: 'linear-gradient(135deg, #E91E63 0%, #9C27B0 100%)',
                            cursor: 'pointer', color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                            boxShadow: '0 2px 8px rgba(156, 39, 176, 0.3)'
                        }}
                    >🎬 Reels</Link>
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
    const [fullScreenVideo, setFullScreenVideo] = useState(null);

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
                <Link href={`/hub/user/${post.author?.name || 'player'}`} style={{ textDecoration: 'none' }}>
                    <Avatar src={post.author?.avatar} name={post.author?.name} size={40} />
                </Link>
                <div style={{ flex: 1 }}>
                    <Link href={`/hub/user/${post.author?.name || 'player'}`} style={{ fontWeight: 600, color: C.text, textDecoration: 'none' }}>
                        {post.author?.name || 'Player'}
                    </Link>
                    <div style={{ fontSize: 12, color: C.textSec }}>{post.timeAgo}</div>
                </div>
                {(post.authorId === currentUserId || post.isGodMode) && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        {post.authorId !== currentUserId && post.isGodMode && (
                            <span style={{ fontSize: 10, background: '#FFD700', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>👑 GOD</span>
                        )}
                        <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 16 }}>🗑️</button>
                    </div>
                )}
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
                            // VIDEO: Clickable thumbnail that opens full-screen viewer
                            <div
                                onClick={() => setFullScreenVideo(post.mediaUrls[0])}
                                style={{
                                    position: 'relative',
                                    cursor: 'pointer',
                                    aspectRatio: '16/9',
                                    background: '#000',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Use YouTube thumbnail for YouTube URLs, video element for direct files */}
                                {isYouTubeUrl(post.mediaUrls[0]) ? (
                                    <img
                                        src={getYouTubeThumbnail(post.mediaUrls[0])}
                                        alt="Video thumbnail"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <video
                                        src={post.mediaUrls[0]}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        muted
                                        playsInline
                                        preload="metadata"
                                    />
                                )}
                                {/* Play Button Overlay */}
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 64, height: 64, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: 28, pointerEvents: 'none'
                                }}>▶</div>
                                {/* "Tap to view" hint */}
                                <div style={{
                                    position: 'absolute', bottom: 8, left: 8,
                                    background: 'rgba(0,0,0,0.6)', padding: '4px 10px',
                                    borderRadius: 4, color: 'white', fontSize: 12, fontWeight: 500
                                }}>🎬 Tap to view full screen</div>
                            </div>
                        ) : post.contentType === 'link' ? (
                            // LINK: Clickable card preview (Facebook-style)
                            <a
                                href={post.mediaUrls[0]}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: 'none', display: 'block' }}
                            >
                                <div style={{
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    background: C.bg,
                                    margin: '0 12px 12px'
                                }}>
                                    {/* Link Preview Image placeholder with gradient */}
                                    <div style={{
                                        height: 200,
                                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontSize: 48
                                    }}>🔗</div>
                                    {/* Link Info */}
                                    <div style={{ padding: '12px 16px', background: C.card }}>
                                        <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>
                                            {new URL(post.mediaUrls[0]).hostname.replace('www.', '')}
                                        </div>
                                        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                                            {post.mediaUrls[0].split('/').pop()?.replace(/-/g, ' ').replace(/\.htm.*/i, '') || 'View Article'}
                                        </div>
                                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>
                                            Click to read full article →
                                        </div>
                                    </div>
                                </div>
                            </a>
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
                <button
                    onClick={() => {
                        const shareUrl = `${window.location.origin}/hub/post/${post.id}`;
                        if (navigator.share) {
                            navigator.share({
                                title: 'Check out this post on Smarter.Poker',
                                text: post.content?.slice(0, 100) || 'A post from Smarter.Poker',
                                url: shareUrl,
                            }).catch(() => { });
                        } else {
                            navigator.clipboard.writeText(shareUrl);
                            alert('Link copied to clipboard!');
                        }
                    }}
                    style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontWeight: 500, fontSize: 13 }}
                >↗️ Share</button>
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

            {/* Full Screen Video Viewer Modal */}
            {fullScreenVideo && (
                <FullScreenVideoViewer
                    videoUrl={fullScreenVideo}
                    author={post.author}
                    caption={post.content}
                    onClose={() => setFullScreenVideo(null)}
                    onLike={handleLike}
                    onComment={() => { setFullScreenVideo(null); setShowComments(true); }}
                    onShare={() => {
                        const shareUrl = `${window.location.origin}/hub/post/${post.id}`;
                        if (navigator.share) {
                            navigator.share({ title: 'Check out this video on Smarter.Poker', url: shareUrl }).catch(() => { });
                        } else {
                            navigator.clipboard.writeText(shareUrl);
                        }
                    }}
                />
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
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    // Global Search State
    const [showGlobalSearch, setShowGlobalSearch] = useState(false);
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState({ users: [], posts: [] });
    const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
    const searchTimeout = useRef(null);
    const globalSearchTimeout = useRef(null);
    const lastScrollY = useRef(0);

    // ♾️ INFINITE SCROLL STATE
    const [feedOffset, setFeedOffset] = useState(0);
    const [hasMorePosts, setHasMorePosts] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const loadMoreRef = useRef(null);
    const POSTS_PER_PAGE = 20;

    // 👑 GOD MODE STATE
    const [isGodMode, setIsGodMode] = useState(false);

    // Global unread message count
    const { unreadCount } = useUnreadCount();

    // 📺 LIVE STREAMING STATE
    const [showGoLiveModal, setShowGoLiveModal] = useState(false);
    const [liveStreams, setLiveStreams] = useState([]);
    const [watchingStream, setWatchingStream] = useState(null);

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
                // Try getSession first (more reliable for browser sessions)
                let authUser = null;
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session?.user) {
                    authUser = sessionData.session.user;
                    console.log('[Social] Auth via getSession:', authUser.email);
                } else {
                    // Fallback to getUser
                    const { data: { user: au } } = await supabase.auth.getUser();
                    authUser = au;
                    console.log('[Social] Auth via getUser:', authUser?.email || 'null');
                }

                if (authUser) {
                    const { data: p } = await supabase.from('profiles').select('username, skill_tier, avatar_url, hendon_url, hendon_total_cashes, hendon_total_earnings, hendon_best_finish, role').eq('id', authUser.id).maybeSingle();
                    // 👑 Check for God Mode
                    if (p?.role === 'god') {
                        setIsGodMode(true);
                    }
                    setUser({
                        id: authUser.id,
                        name: p?.username || authUser.email?.split('@')[0] || 'Player',
                        avatar: p?.avatar_url || null,
                        tier: p?.skill_tier,
                        role: p?.role || 'user',
                        hendon: p?.hendon_url ? {
                            url: p.hendon_url,
                            cashes: p.hendon_total_cashes,
                            earnings: p.hendon_total_earnings,
                            bestFinish: p.hendon_best_finish
                        } : null
                    });
                    await loadContacts(authUser.id);
                    // Load notifications
                    const { data: notifs } = await supabase.from('notifications')
                        .select('*')
                        .eq('user_id', authUser.id)
                        .order('created_at', { ascending: false })
                        .limit(20);
                    if (notifs) setNotifications(notifs);
                } else {
                    console.log('[Social] No authenticated user found');
                }
                await loadFeed();
                // Load live streams
                try {
                    const streams = await LiveStreamService.getLiveStreams();
                    setLiveStreams(streams || []);
                } catch (e) { console.log('No live streams:', e); }
            } catch (e) { console.error('[Social] Auth error:', e); }
            setLoading(false);
        })();
    }, []);

    const loadFeed = async (offset = 0, append = false) => {
        try {
            if (append) setLoadingMore(true);

            // Use getSession for consistent auth (same as initial load)
            let authUser = null;
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData?.session?.user) {
                authUser = sessionData.session.user;
            }

            // Get friend IDs for prioritization
            let friendIds = [];
            let followingIds = [];

            if (authUser) {
                // Fetch friends (accepted friendships)
                const { data: friendships } = await supabase
                    .from('friendships')
                    .select('friend_id')
                    .eq('user_id', authUser.id)
                    .eq('status', 'accepted');
                if (friendships) friendIds = friendships.map(f => f.friend_id);

                // Fetch people I'm following
                const { data: follows } = await supabase
                    .from('follows')
                    .select('following_id')
                    .eq('follower_id', authUser.id);
                if (follows) followingIds = follows.map(f => f.following_id);
            }

            // Combine friends and following for priority
            const priorityUserIds = [...new Set([...friendIds, ...followingIds])];

            // ♾️ INFINITE SCROLL: Fetch posts with offset
            // Fetch all posts with pagination
            const { data: allPostsData, error } = await supabase
                .from('social_posts')
                .select('id, content, content_type, media_urls, like_count, comment_count, share_count, created_at, author_id')
                .or('visibility.eq.public,visibility.is.null')
                .order('created_at', { ascending: false })
                .range(offset, offset + POSTS_PER_PAGE - 1);

            if (error) throw error;

            // Check if there are more posts
            if (!allPostsData || allPostsData.length < POSTS_PER_PAGE) {
                setHasMorePosts(false);
            } else {
                setHasMorePosts(true);
            }

            // Mark priority posts
            const mixedFeed = (allPostsData || []).map(p => ({
                ...p,
                isPriority: priorityUserIds.includes(p.author_id)
            }));

            // Fetch author profiles
            if (mixedFeed.length > 0) {
                const authorIds = [...new Set(mixedFeed.map(p => p.author_id).filter(Boolean))];
                let authorMap = {};
                if (authorIds.length) {
                    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', authorIds);
                    if (profiles) authorMap = Object.fromEntries(profiles.map(p => [p.id, p]));
                }

                const formattedPosts = mixedFeed.map(p => ({
                    id: p.id,
                    authorId: p.author_id,
                    content: p.content,
                    contentType: p.content_type,
                    mediaUrls: p.media_urls || [],
                    likeCount: p.like_count || 0,
                    commentCount: p.comment_count || 0,
                    shareCount: p.share_count || 0,
                    timeAgo: timeAgo(p.created_at),
                    isLiked: false,
                    isPriority: p.isPriority,
                    isFriend: friendIds.includes(p.author_id),
                    isFollowing: followingIds.includes(p.author_id),
                    author: {
                        name: authorMap[p.author_id]?.username || 'Player',
                        avatar: authorMap[p.author_id]?.avatar_url || null
                    }
                }));

                if (append) {
                    setPosts(prev => [...prev, ...formattedPosts]);
                } else {
                    setPosts(formattedPosts);
                }
            }
        } catch (e) { console.error('Feed error:', e); }
        finally {
            setLoadingMore(false);
        }
    };

    // ♾️ INFINITE SCROLL: Load more posts when scrolling
    const loadMorePosts = async () => {
        if (loadingMore || !hasMorePosts) return;
        const newOffset = feedOffset + POSTS_PER_PAGE;
        setFeedOffset(newOffset);
        await loadFeed(newOffset, true);
    };

    // ♾️ INFINITE SCROLL: IntersectionObserver for triggering load
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMorePosts && !loadingMore) {
                    loadMorePosts();
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [hasMorePosts, loadingMore, feedOffset]);

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

            // AUTO-SAVE VIDEOS TO REELS 🎬
            // When a video is posted, automatically create a Reel entry
            if (type === 'video' && urls.length > 0) {
                const videoUrl = urls.find(url =>
                    url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') ||
                    url.includes('video') || !url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                ) || urls[0];

                try {
                    await supabase.from('social_reels').insert({
                        author_id: user.id,
                        video_url: videoUrl,
                        caption: content || null,
                        source_post_id: data.id,
                        is_public: true,
                        view_count: 0,
                        like_count: 0
                    });
                    console.log('🎬 Video auto-saved to Reels!');
                } catch (reelError) {
                    console.error('Failed to auto-save to Reels:', reelError);
                    // Don't fail the post if Reel creation fails
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
                // Search users
                const { data: users } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .ilike('username', `%${query}%`)
                    .limit(5);

                // Search posts
                const { data: posts } = await supabase
                    .from('social_posts')
                    .select('id, content, author_id, created_at')
                    .ilike('content', `%${query}%`)
                    .limit(5);

                // Get author info for posts
                let enrichedPosts = [];
                if (posts?.length) {
                    const authorIds = [...new Set(posts.map(p => p.author_id))];
                    const { data: authors } = await supabase.from('profiles').select('id, username').in('id', authorIds);
                    const authorMap = Object.fromEntries((authors || []).map(a => [a.id, a]));
                    enrichedPosts = posts.map(p => ({
                        ...p,
                        author: authorMap[p.author_id]
                    }));
                }

                setGlobalSearchResults({
                    users: users || [],
                    posts: enrichedPosts
                });
            } catch (e) {
                console.error('Global search error:', e);
            }
            setGlobalSearchLoading(false);
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
            <Head>
                <title>Social Hub | Smarter.Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    html, body { background: ${C.bg} !important; }
                    
                    .social-page-container {
                        width: 800px;
                        max-width: 800px;
                        margin: 0 auto;
                        overflow-x: hidden;
                    }
                    
                    /* Mobile phones (390-450px) - zoom to ~50% */
                    @media (max-width: 500px) {
                        .social-page-container { zoom: 0.5; }
                    }
                    
                    /* Large phones / small tablets (501-700px) */
                    @media (min-width: 501px) and (max-width: 700px) {
                        .social-page-container { zoom: 0.75; }
                    }
                    
                    /* Tablets (701-900px) */
                    @media (min-width: 701px) and (max-width: 900px) {
                        .social-page-container { zoom: 0.95; }
                    }
                    
                    /* Desktop (901px+) - slight scale up */
                    @media (min-width: 901px) {
                        .social-page-container { zoom: 1.2; }
                    }
                    
                    /* Large desktop (1400px+) - cap at 1.5x */
                    @media (min-width: 1400px) {
                        .social-page-container { zoom: 1.5; }
                    }
                `}</style>
            </Head>

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

                {/* Poker Resume - Show when HendonMob is linked */}
                {user?.hendon && (
                    <div style={{
                        margin: '0 12px 16px', padding: 16, borderRadius: 12,
                        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 100%)',
                        border: '1px solid rgba(255, 215, 0, 0.3)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 24 }}>🏆</span>
                            <div>
                                <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 14 }}>POKER RESUME</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Tournament Stats</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#FFD700', fontSize: 18, fontWeight: 700 }}>{user.hendon.cashes || '—'}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>CASHES</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#00ff88', fontSize: 18, fontWeight: 700 }}>${user.hendon.earnings?.toLocaleString() || '—'}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>EARNINGS</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#00d4ff', fontSize: 18, fontWeight: 700 }}>${user.hendon.biggestCash?.toLocaleString() || user.hendon.bestFinish || '—'}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>BIG CASH</div>
                            </div>
                        </div>
                    </div>
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
                        { icon: '🎬', label: 'Reels', href: '/hub/reels' },
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
                        <Link href="/hub" style={{ fontWeight: 700, fontSize: 22, color: C.blue, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 20 }}>🔵</span> smarter.poker</Link>
                    </div>

                    {/* RIGHT: Search, Notifications, Messenger, Profile */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                            onClick={() => setShowGlobalSearch(!showGlobalSearch)}
                            style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: showGlobalSearch ? C.blue : '#e4e6eb',
                                border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                color: showGlobalSearch ? 'white' : 'inherit'
                            }}
                        >🔍</button>
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            style={{
                                width: 40, height: 40, borderRadius: '50%', background: showNotifications ? C.blue : '#e4e6eb',
                                border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', position: 'relative',
                                color: showNotifications ? 'white' : 'inherit'
                            }}>
                            🔔
                            {notifications.filter(n => !n.read).length > 0 && (
                                <span style={{
                                    position: 'absolute', top: 0, right: 0, background: 'red', color: 'white',
                                    borderRadius: '50%', width: 18, height: 18, fontSize: 11, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>{notifications.filter(n => !n.read).length}</span>
                            )}
                        </button>
                        <Link href="/hub/messenger" style={{
                            width: 40, height: 40, borderRadius: '50%', background: '#e4e6eb',
                            border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
                            position: 'relative',
                        }}>
                            💬
                            <UnreadBadge count={unreadCount} size="small" />
                        </Link>
                        <Link href="/hub/profile" style={{ display: 'block' }}>
                            <Avatar src={user?.avatar} name={user?.name} size={40} />
                        </Link>
                    </div>
                </header>

                {/* Global Search Overlay */}
                {showGlobalSearch && (
                    <div style={{
                        position: 'fixed', top: 60, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 998
                    }} onClick={() => setShowGlobalSearch(false)} />
                )}
                {showGlobalSearch && (
                    <div style={{
                        position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
                        width: '100%', maxWidth: 600, background: C.card, borderRadius: '0 0 12px 12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 999, maxHeight: 'calc(100vh - 80px)',
                        overflowY: 'auto'
                    }}>
                        <div style={{ padding: 16 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                background: C.bg, borderRadius: 24, padding: '0 16px'
                            }}>
                                <span style={{ fontSize: 18 }}>🔍</span>
                                <input
                                    type="text"
                                    value={globalSearchQuery}
                                    onChange={e => handleGlobalSearch(e.target.value)}
                                    placeholder="Search Smarter.Poker..."
                                    autoFocus
                                    style={{
                                        flex: 1, border: 'none', background: 'transparent',
                                        padding: '12px 0', fontSize: 16, outline: 'none'
                                    }}
                                />
                                {globalSearchQuery && (
                                    <button
                                        onClick={() => { setGlobalSearchQuery(''); setGlobalSearchResults({ users: [], posts: [] }); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec }}
                                    >✕</button>
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
                                        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.textSec }}>
                                            People
                                        </div>
                                        {globalSearchResults.users.map(u => (
                                            <Link
                                                key={u.id}
                                                href={`/hub/user/${u.username}`}
                                                onClick={() => setShowGlobalSearch(false)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 12,
                                                    padding: '10px 16px', textDecoration: 'none', color: 'inherit'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
                                        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.textSec }}>
                                            Posts
                                        </div>
                                        {globalSearchResults.posts.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => { setShowGlobalSearch(false); }}
                                                style={{
                                                    padding: '10px 16px', cursor: 'pointer'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>
                                                    {p.author?.username || 'Player'}
                                                </div>
                                                <div style={{ fontSize: 14, color: C.text }}>
                                                    {p.content?.slice(0, 100)}{p.content?.length > 100 ? '...' : ''}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* No results */}
                                {globalSearchResults.users.length === 0 && globalSearchResults.posts.length === 0 && (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textSec }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                                        No results found for "{globalSearchQuery}"
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Notification Dropdown */}
                {showNotifications && (
                    <div style={{
                        position: 'fixed', top: 60, right: 12, width: 360, maxHeight: 480,
                        background: C.card, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        zIndex: 1000, overflowY: 'auto'
                    }}>
                        <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Notifications</h3>
                            <button
                                onClick={() => setShowNotifications(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                            >✕</button>
                        </div>
                        {notifications.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: C.textSec }}>
                                No notifications yet
                            </div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    onClick={async () => {
                                        if (!n.read) {
                                            await supabase.from('notifications').update({ read: true }).eq('id', n.id);
                                            setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                                        }
                                    }}
                                    style={{
                                        padding: 12, borderBottom: `1px solid ${C.border}`,
                                        display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                                        background: n.read ? 'transparent' : 'rgba(24, 119, 242, 0.05)'
                                    }}
                                >
                                    <div style={{
                                        width: 48, height: 48, borderRadius: '50%', background: C.blue,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 24, flexShrink: 0
                                    }}>
                                        {n.type === 'like' ? '👍' : n.type === 'comment' ? '💬' : n.type === 'mention' ? '@' : n.type === 'friend_request' ? '👥' : '🔔'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{n.title}</div>
                                        <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>{n.message}</div>
                                        <div style={{ fontSize: 11, color: C.blue, marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                                    </div>
                                    {!n.read && (
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.blue, flexShrink: 0, marginTop: 6 }} />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Main Feed - 800px Design Canvas */}
                <main className="social-page-container" style={{ padding: '8px' }}>
                    {/* Stories Bar */}
                    {user && <StoriesBar userId={user.id} />}

                    {/* Post Creator */}
                    {user && <PostCreator user={user} onPost={handlePost} isPosting={isPosting} onGoLive={() => setShowGoLiveModal(true)} />}

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

                    {/* 📺 LIVE STREAMS SECTION */}
                    {liveStreams.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <h4 style={{ margin: '0 0 10px 4px', fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                                🔴 Live Now
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

                    {/* Posts Feed */}
                    {posts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ fontSize: 48 }}>🌟</div>
                            <h3 style={{ color: C.text }}>No posts yet</h3>
                            <p>Be the first to share something!</p>
                        </div>
                    ) : (
                        <>
                            {/* Render posts with Reels carousel inserted after every 3 posts */}
                            {posts.map((p, index) => (
                                <>
                                    <PostCard key={p.id} post={{ ...p, isGodMode }} currentUserId={user?.id} currentUserName={user?.name} onLike={handleLike} onDelete={handleDelete} />
                                    {/* Insert Reels carousel after 3rd post */}
                                    {index === 2 && <ReelsFeedCarousel key="reels-carousel" />}
                                </>
                            ))}

                            {/* ♾️ INFINITE SCROLL: Load more trigger */}
                            <div ref={loadMoreRef} style={{
                                padding: '20px',
                                textAlign: 'center',
                                minHeight: 60
                            }}>
                                {loadingMore && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        color: C.textSec
                                    }}>
                                        <span style={{
                                            width: 20,
                                            height: 20,
                                            border: `2px solid ${C.border}`,
                                            borderTopColor: C.blue,
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite'
                                        }} />
                                        Loading more posts...
                                    </div>
                                )}
                                {!hasMorePosts && posts.length > 0 && (
                                    <p style={{ color: C.textSec, fontSize: 14 }}>
                                        🎉 You've seen all the posts!
                                    </p>
                                )}
                            </div>

                            <style jsx>{`
                                @keyframes spin {
                                    to { transform: rotate(360deg); }
                                }
                            `}</style>
                        </>
                    )}
                </main>

                {/* Bottom Navigation Bar - Enhanced with larger click targets */}
                <nav style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0, height: 60,
                    background: C.card, borderTop: `1px solid ${C.border}`,
                    display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
                    zIndex: 100,
                    transform: bottomNavVisible ? 'translateY(0)' : 'translateY(100%)',
                    transition: 'transform 0.3s ease',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)'
                }}>
                    <Link href="/hub/social-media" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: C.blue, flex: 1, padding: '8px 4px', minWidth: 50
                    }}>
                        <span style={{ fontSize: 22 }}>🏠</span>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Home</span>
                    </Link>
                    <Link href="/hub/reels" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: C.textSec, flex: 1, padding: '8px 4px', minWidth: 50
                    }}>
                        <span style={{ fontSize: 22 }}>📺</span>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Reels</span>
                    </Link>
                    <Link href="/hub/friends" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: C.textSec, flex: 1, padding: '8px 4px', minWidth: 50, position: 'relative'
                    }}>
                        <span style={{ fontSize: 22 }}>👥</span>
                        <div style={{ position: 'absolute', top: 4, right: 'calc(50% - 20px)', background: C.red, color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, pointerEvents: 'none' }}>1</div>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Friends</span>
                    </Link>
                    <Link href="/hub/club-arena" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: C.textSec, flex: 1, padding: '8px 4px', minWidth: 50
                    }}>
                        <span style={{ fontSize: 22 }}>🏛️</span>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Clubs</span>
                    </Link>
                    <Link href="/hub/notifications" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: C.textSec, flex: 1, padding: '8px 4px', minWidth: 50, position: 'relative'
                    }}>
                        <span style={{ fontSize: 22 }}>🔔</span>
                        {notifications.filter(n => !n.read).length > 0 && (
                            <div style={{ position: 'absolute', top: 4, right: 'calc(50% - 20px)', background: C.red, color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, pointerEvents: 'none' }}>{notifications.filter(n => !n.read).length}</div>
                        )}
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Alerts</span>
                    </Link>
                    <Link href="/hub/profile" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: C.textSec, flex: 1, padding: '8px 4px', minWidth: 50
                    }}>
                        {user ? <Avatar src={user.avatar} name={user.name} size={26} /> : <span style={{ fontSize: 22 }}>👤</span>}
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Profile</span>
                    </Link>
                </nav>

                {/* Chat Windows */}
                <div style={{ position: 'fixed', bottom: 70, right: 16, display: 'flex', gap: 8, zIndex: 1000 }}>
                    {openChats.map(ch => <ChatWindow key={ch.id} chat={ch} messages={chatMsgs[ch.id] || []} currentUserId={user?.id} onSend={txt => handleSendMsg(ch.id, txt)} onClose={() => setOpenChats(prev => prev.filter(x => x.id !== ch.id))} />)}
                </div>

                {/* Go Live Modal */}
                <GoLiveModal
                    isOpen={showGoLiveModal}
                    onClose={() => {
                        setShowGoLiveModal(false);
                        // Refresh live streams after closing
                        LiveStreamService.getLiveStreams().then(setLiveStreams).catch(() => { });
                    }}
                    user={user}
                />

                {/* Live Stream Viewer Modal */}
                {watchingStream && (
                    <LiveStreamViewer
                        stream={watchingStream}
                        userId={user?.id}
                        onClose={() => {
                            setWatchingStream(null);
                            // Refresh live streams
                            LiveStreamService.getLiveStreams().then(setLiveStreams).catch(() => { });
                        }}
                    />
                )}
            </div>
        </>
    );
}
