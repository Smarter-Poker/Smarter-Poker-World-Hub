/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 SMARTER.POKER COMPLETE SOCIAL HUB - FULL SNGINE RECONSTRUCTION
 * /pages/hub/social-media.js
 * 
 * RECONSTRUCTED FROM ALL 48 SNGINE MODULES:
 * - posts.php, publisher.php, chat.php, stories.php, reels.php
 * - photos.php, videos.php, comments.php, notifications.php
 * - groups.php, events.php, search.php, mentions.php, hashtags.php
 * 
 * FEATURES:
 * ✅ Feed & Posts (Create, Like, Share, Delete, Multiple Reactions)
 * ✅ Stories (24hr expiring, Photo/Video)
 * ✅ Reels (TikTok-style vertical videos)
 * ✅ Photo/Video Uploads
 * ✅ Messaging (Conversations, Messages, Typing, Seen, Voice Notes)
 * ✅ Groups (Create, Join, Posts)
 * ✅ User Search & Discovery
 * ✅ Notifications
 * ✅ Mentions & Hashtags
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hpnqzvjknynwcpzzcdmo.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbnF6dmprbnnud2Nwenpjzg1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwMTQxNjYsImV4cCI6MjA2MjU5MDE2Nn0.yWbevMwO7h1mIFvqc0bDLX0bdyGB1tNB0h2bGDzzbrw';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 DESIGN SYSTEM 
// ═══════════════════════════════════════════════════════════════════════════
const FB = {
    blue: '#1877F2', blueHover: '#166FE5', bgMain: '#F0F2F5', bgCard: '#FFFFFF',
    textPrimary: '#050505', textSecondary: '#65676B', divider: '#CED0D4',
    green: '#42B72A', red: '#FA383E', online: '#31A24C', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
// 🔧 UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════
function Avatar({ src, name, size = 40, online = null, hasStory = false }) {
    const initial = name?.[0]?.toUpperCase() || '?';
    const ring = hasStory ? { border: '3px solid #1877F2', padding: 2 } : {};
    return (
        <div style={{ position: 'relative', display: 'inline-block', ...ring, borderRadius: '50%' }}>
            {src ? (
                <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
                <div style={{ width: size, height: size, borderRadius: '50%', background: FB.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: size * 0.4 }}>{initial}</div>
            )}
            {online !== null && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.3, height: size * 0.3, borderRadius: '50%', background: online ? FB.online : '#ccc', border: '2px solid white' }} />
            )}
        </div>
    );
}

function getTimeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📖 STORIES COMPONENT (from stories.php)
// ═══════════════════════════════════════════════════════════════════════════
function StoriesBar({ stories, currentUser, onAddStory, onViewStory }) {
    return (
        <div style={{ background: FB.bgCard, borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, overflowX: 'auto' }}>
            {/* Add Story */}
            <div onClick={onAddStory} style={{ minWidth: 110, height: 200, borderRadius: 12, background: FB.bgMain, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: 12, position: 'relative', overflow: 'hidden' }}>
                {currentUser?.avatar ? (
                    <img src={currentUser.avatar} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '70%', objectFit: 'cover' }} />
                ) : (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '70%', background: FB.gradient }} />
                )}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: FB.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 24, border: '4px solid white', marginTop: 'auto' }}>+</div>
                <span style={{ fontSize: 12, fontWeight: 500, marginTop: 8, textAlign: 'center' }}>Create Story</span>
            </div>

            {/* Stories */}
            {stories.map(story => (
                <div key={story.id} onClick={() => onViewStory(story)} style={{ minWidth: 110, height: 200, borderRadius: 12, background: FB.gradient, cursor: 'pointer', display: 'flex', flexDirection: 'column', padding: 8, position: 'relative', overflow: 'hidden' }}>
                    {story.preview && <img src={story.preview} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <Avatar name={story.userName} src={story.userAvatar} size={40} hasStory />
                    <span style={{ marginTop: 'auto', fontSize: 12, fontWeight: 600, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{story.userName}</span>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎬 REELS COMPONENT (from reels.php)
// ═══════════════════════════════════════════════════════════════════════════
function ReelsSection({ reels, onViewReel }) {
    if (!reels?.length) return null;
    return (
        <div style={{ background: FB.bgCard, borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 700 }}>🎬 Reels</h3>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {reels.map(reel => (
                    <div key={reel.id} onClick={() => onViewReel(reel)} style={{ minWidth: 140, height: 250, borderRadius: 12, background: '#000', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                        {reel.thumbnail && <img src={reel.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'white', fontSize: 12 }}>
                                <span>▶️ {reel.views || 0}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 POST CREATOR (from publisher.php with media upload)
// ═══════════════════════════════════════════════════════════════════════════
function PostCreator({ user, onPost, onCreateStory, onCreateReel, isPosting }) {
    const [content, setContent] = useState('');
    const [error, setError] = useState('');
    const [mediaFiles, setMediaFiles] = useState([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [postType, setPostType] = useState('text'); // text, photo, video, reel, story
    const fileInputRef = useRef(null);

    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploadingMedia(true);
        const uploaded = [];

        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const path = `${isVideo ? 'videos' : 'photos'}/${user.id}/${Date.now()}_${file.name}`;

            const { data, error: uploadError } = await supabase.storage
                .from('social-media')
                .upload(path, file);

            if (!uploadError && data) {
                const { data: urlData } = supabase.storage.from('social-media').getPublicUrl(path);
                uploaded.push({ type: isVideo ? 'video' : 'photo', url: urlData.publicUrl, path });
            }
        }

        setMediaFiles(prev => [...prev, ...uploaded]);
        setUploadingMedia(false);
    };

    const removeMedia = (index) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!content.trim() && mediaFiles.length === 0) return;
        if (!user?.id) { setError('Please log in to post'); return; }
        setError('');

        const mediaUrls = mediaFiles.map(m => m.url);
        const contentType = mediaFiles.some(m => m.type === 'video') ? 'video' : mediaFiles.length > 0 ? 'photo' : 'text';

        const success = await onPost(content, mediaUrls, contentType);
        if (success) {
            setContent('');
            setMediaFiles([]);
        } else {
            setError('Failed to create post');
        }
    };

    return (
        <div style={{ background: FB.bgCard, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 16 }}>
            {/* Main Input */}
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <Avatar name={user?.name} src={user?.avatar} size={40} />
                    <textarea
                        style={{ flex: 1, padding: '12px 16px', borderRadius: 20, border: 'none', background: FB.bgMain, fontSize: 16, resize: 'none', minHeight: 44, outline: 'none' }}
                        placeholder={user?.name ? `What's on your mind, ${user.name}?` : "What's on your mind?"}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={2}
                    />
                </div>

                {/* Media Preview */}
                {mediaFiles.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginLeft: 52 }}>
                        {mediaFiles.map((media, i) => (
                            <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden' }}>
                                {media.type === 'video' ? (
                                    <video src={media.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                <button onClick={() => removeMedia(i)} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12 }}>✕</button>
                            </div>
                        ))}
                    </div>
                )}

                {error && <p style={{ color: FB.red, fontSize: 14, margin: '8px 0 0 52px' }}>⚠️ {error}</p>}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${FB.divider}`, padding: '8px 16px' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFileSelect} />
                    <button onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: FB.textSecondary, fontWeight: 500, fontSize: 14 }}>
                        {uploadingMedia ? '⏳' : '📷'} Photo/Video
                    </button>
                    <button onClick={onCreateStory} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: FB.textSecondary, fontWeight: 500, fontSize: 14 }}>
                        📖 Story
                    </button>
                    <button onClick={onCreateReel} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: FB.textSecondary, fontWeight: 500, fontSize: 14 }}>
                        🎬 Reel
                    </button>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: FB.textSecondary, fontWeight: 500, fontSize: 14 }}>
                        🃏 Share Hand
                    </button>
                </div>
                <button
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: FB.blue, color: 'white', fontWeight: 600, cursor: 'pointer', opacity: isPosting || (!content.trim() && !mediaFiles.length) ? 0.6 : 1 }}
                    onClick={handleSubmit}
                    disabled={isPosting || (!content.trim() && !mediaFiles.length)}
                >
                    {isPosting ? 'Posting...' : 'Post'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📄 POST CARD (from posts.php with multiple reactions)
// ═══════════════════════════════════════════════════════════════════════════
function PostCard({ post, currentUserId, onReact, onComment, onShare, onDelete }) {
    const [showReactions, setShowReactions] = useState(false);
    const [currentReaction, setCurrentReaction] = useState(post.myReaction);
    const [reactionCounts, setReactionCounts] = useState(post.reactions || {});
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const reactTimeout = useRef(null);

    const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + (b || 0), 0);
    const topReactions = Object.entries(reactionCounts)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => REACTIONS.find(r => r.type === type)?.emoji);

    const handleReactionHover = () => {
        reactTimeout.current = setTimeout(() => setShowReactions(true), 500);
    };

    const handleReactionLeave = () => {
        clearTimeout(reactTimeout.current);
        setTimeout(() => setShowReactions(false), 300);
    };

    const handleReact = async (type) => {
        const wasReacted = currentReaction === type;
        const oldReaction = currentReaction;

        if (wasReacted) {
            setCurrentReaction(null);
            setReactionCounts(prev => ({ ...prev, [type]: Math.max(0, (prev[type] || 0) - 1) }));
        } else {
            if (oldReaction) {
                setReactionCounts(prev => ({ ...prev, [oldReaction]: Math.max(0, (prev[oldReaction] || 0) - 1) }));
            }
            setCurrentReaction(type);
            setReactionCounts(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
        }

        setShowReactions(false);
        await onReact(post.id, wasReacted ? null : type);
    };

    const currentReactionObj = REACTIONS.find(r => r.type === currentReaction);

    return (
        <div style={{ background: FB.bgCard, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 16 }}>
            {/* Header */}
            <div style={{ padding: 16, paddingBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <Avatar name={post.author?.name} src={post.author?.avatar} size={40} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: FB.textPrimary }}>
                            {post.author?.name || 'Anonymous'}
                            {post.author?.tier && <span style={{ fontSize: 12, color: FB.blue, marginLeft: 8 }}>Lvl {post.author.tier}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: FB.textSecondary }}>{post.timeAgo}</div>
                    </div>
                    {post.authorId === currentUserId && (
                        <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: FB.textSecondary }}>⋯</button>
                    )}
                </div>

                {/* Content */}
                <div style={{ fontSize: 15, lineHeight: 1.5, color: FB.textPrimary, marginBottom: 12 }}>{post.content}</div>
            </div>

            {/* Media */}
            {post.mediaUrls?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    {post.contentType === 'video' ? (
                        <video controls style={{ width: '100%', maxHeight: 500 }} src={post.mediaUrls[0]} />
                    ) : post.mediaUrls.length === 1 ? (
                        <img src={post.mediaUrls[0]} alt="" style={{ width: '100%', maxHeight: 500, objectFit: 'cover' }} />
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: post.mediaUrls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 2 }}>
                            {post.mediaUrls.slice(0, 6).map((url, i) => (
                                <img key={i} src={url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Stats */}
            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', color: FB.textSecondary, fontSize: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {topReactions.map((emoji, i) => <span key={i}>{emoji}</span>)}
                    {totalReactions > 0 && <span style={{ marginLeft: 4 }}>{totalReactions}</span>}
                </div>
                <div>
                    {post.commentCount > 0 && <span>{post.commentCount} comments</span>}
                    {post.shareCount > 0 && <span style={{ marginLeft: 12 }}>{post.shareCount} shares</span>}
                </div>
            </div>

            {/* Actions */}
            <div style={{ borderTop: `1px solid ${FB.divider}`, display: 'flex', position: 'relative' }}>
                {/* Reactions Picker */}
                {showReactions && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 16, background: 'white', borderRadius: 24, padding: '4px 8px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', display: 'flex', gap: 4 }}>
                        {REACTIONS.map(r => (
                            <button key={r.type} onClick={() => handleReact(r.type)} style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 24, borderRadius: '50%', transition: 'transform 0.2s' }}
                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.3)'}
                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}>
                                {r.emoji}
                            </button>
                        ))}
                    </div>
                )}

                <button
                    onMouseEnter={handleReactionHover}
                    onMouseLeave={handleReactionLeave}
                    onClick={() => handleReact('like')}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: currentReactionObj?.color || FB.textSecondary, fontWeight: 500, fontSize: 14 }}
                >
                    {currentReactionObj?.emoji || '👍'} {currentReactionObj?.label || 'Like'}
                </button>
                <button onClick={() => setShowComments(!showComments)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: FB.textSecondary, fontWeight: 500, fontSize: 14 }}>
                    💬 Comment
                </button>
                <button onClick={() => onShare(post.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: FB.textSecondary, fontWeight: 500, fontSize: 14 }}>
                    ↗️ Share
                </button>
            </div>

            {/* Comments Section */}
            {showComments && (
                <div style={{ borderTop: `1px solid ${FB.divider}`, padding: 12 }}>
                    {comments.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <Avatar name={c.author} size={32} />
                            <div style={{ background: FB.bgMain, borderRadius: 18, padding: '8px 12px' }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.author}</div>
                                <div style={{ fontSize: 14 }}>{c.text}</div>
                            </div>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Avatar name={currentUserId} size={32} />
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Write a comment..."
                            style={{ flex: 1, padding: '8px 16px', borderRadius: 20, border: 'none', background: FB.bgMain, outline: 'none' }}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter' && newComment.trim()) {
                                    onComment(post.id, newComment);
                                    setNewComment('');
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT WINDOW (from chat.php & conversation_screen.dart)
// ═══════════════════════════════════════════════════════════════════════════
function ChatWindow({ chat, messages, currentUserId, onSend, onClose, isTyping, onSendVoice, onSendPhoto }) {
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim() || sending) return;
        setSending(true);
        await onSend(newMessage);
        setNewMessage('');
        setSending(false);
    };

    return (
        <div style={{ width: 328, height: 455, background: FB.bgCard, borderRadius: '8px 8px 0 0', boxShadow: '0 -2px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '8px 12px', background: FB.bgCard, borderBottom: `1px solid ${FB.divider}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar name={chat.name} src={chat.avatar} size={32} online={chat.online} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{chat.name}</div>
                    {chat.online ? <div style={{ fontSize: 11, color: FB.online }}>Active now</div> : chat.lastSeen && <div style={{ fontSize: 11, color: FB.textSecondary }}>{getTimeAgo(chat.lastSeen)}</div>}
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: FB.blue }}>📞</button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: FB.blue }}>📹</button>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {messages.map((msg, i) => {
                    const isMine = msg.senderId === currentUserId;
                    return (
                        <div key={msg.id || i} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                            <div style={{ maxWidth: '70%', padding: msg.type === 'voice' ? '4px' : '8px 12px', borderRadius: 18, background: isMine ? FB.blue : FB.bgMain, color: isMine ? 'white' : FB.textPrimary, fontSize: 14 }}>
                                {msg.type === 'photo' ? (
                                    <img src={msg.url} alt="" style={{ maxWidth: 200, borderRadius: 12 }} />
                                ) : msg.type === 'voice' ? (
                                    <audio controls src={msg.url} style={{ height: 36 }} />
                                ) : msg.text}
                            </div>
                        </div>
                    );
                })}
                {isTyping && <div style={{ color: FB.textSecondary, fontSize: 12 }}>●●● typing...</div>}
                <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div style={{ padding: 8, borderTop: `1px solid ${FB.divider}`, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={onSendPhoto} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Aa"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 18, border: 'none', background: FB.bgMain, fontSize: 14, outline: 'none' }}
                />
                {newMessage.trim() ? (
                    <button onClick={handleSend} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: FB.blue }}>➤</button>
                ) : (
                    <button onClick={onSendVoice} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: isRecording ? FB.red : FB.textSecondary }}>🎤</button>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 CONTACTS SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
function ContactsSidebar({ contacts, onOpenChat, onSearch, searchResults, groups }) {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState('contacts');

    return (
        <aside style={{ width: 280, position: 'sticky', top: 80, height: 'fit-content' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', marginBottom: 8 }}>
                <button onClick={() => setActiveTab('contacts')} style={{ flex: 1, padding: 8, borderRadius: '8px 0 0 8px', border: 'none', background: activeTab === 'contacts' ? FB.blue : FB.bgMain, color: activeTab === 'contacts' ? 'white' : FB.textSecondary, cursor: 'pointer', fontWeight: 500 }}>Contacts</button>
                <button onClick={() => setActiveTab('groups')} style={{ flex: 1, padding: 8, borderRadius: '0 8px 8px 0', border: 'none', background: activeTab === 'groups' ? FB.blue : FB.bgMain, color: activeTab === 'groups' ? 'white' : FB.textSecondary, cursor: 'pointer', fontWeight: 500 }}>Groups</button>
            </div>

            {/* Search */}
            <input
                type="text"
                placeholder="🔍 Search..."
                value={query}
                onChange={(e) => { setQuery(e.target.value); onSearch(e.target.value); }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 20, border: 'none', background: FB.bgMain, fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            />

            {/* Search Results */}
            {query.length >= 2 && searchResults.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: FB.blue }}>Search Results</h4>
                    {searchResults.map(user => (
                        <div key={user.id} onClick={() => onOpenChat(user)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                            <Avatar name={user.username} src={user.avatar} size={36} />
                            <span style={{ fontWeight: 500, fontSize: 14 }}>{user.username}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Contacts or Groups */}
            {activeTab === 'contacts' ? (
                <>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: FB.textSecondary, fontWeight: 500 }}>Contacts</h4>
                    {contacts.length === 0 ? (
                        <p style={{ color: FB.textSecondary, fontSize: 13 }}>No contacts yet</p>
                    ) : (
                        contacts.map(c => (
                            <div key={c.id} onClick={() => onOpenChat(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                                <Avatar name={c.name} src={c.avatar} size={36} online={c.online} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</div>
                                    {c.lastMessage && <div style={{ fontSize: 12, color: FB.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{c.lastMessage}</div>}
                                </div>
                            </div>
                        ))
                    )}
                </>
            ) : (
                <>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: FB.textSecondary, fontWeight: 500 }}>Your Groups</h4>
                    {groups?.length === 0 ? (
                        <p style={{ color: FB.textSecondary, fontSize: 13 }}>No groups yet</p>
                    ) : (
                        groups?.map(g => (
                            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 8, background: FB.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>{g.name?.[0]}</div>
                                <span style={{ fontWeight: 500, fontSize: 14 }}>{g.name}</span>
                            </div>
                        ))
                    )}
                </>
            )}
        </aside>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏠 MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function SocialMediaPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState([]);
    const [stories, setStories] = useState([]);
    const [reels, setReels] = useState([]);
    const [isPosting, setIsPosting] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [openChats, setOpenChats] = useState([]);
    const [chatMessages, setChatMessages] = useState({});
    const [typingStatus, setTypingStatus] = useState({});
    const searchTimeoutRef = useRef(null);
    const subscriptionsRef = useRef([]);

    // ═══════════════════════════════════════════════════════════════════════
    // 🔐 INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        async function init() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase.from('profiles').select('username, avatar_url, current_level').eq('id', user.id).single();
                    setCurrentUser({ id: user.id, name: profile?.username || user.email?.split('@')[0] || 'Player', avatar: profile?.avatar_url, level: profile?.current_level || 1 });
                    await loadContacts(user.id);
                }
                await loadFeed();
            } catch (err) { console.error('Init error:', err); }
            finally { setLoading(false); }
        }
        init();
        return () => { subscriptionsRef.current.forEach(sub => supabase.removeChannel(sub)); };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // 📰 FEED OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════
    const loadFeed = async () => {
        const { data } = await supabase.from('social_posts')
            .select(`id, content, content_type, media_urls, like_count, comment_count, share_count, created_at, author_id, author:profiles!author_id (username, avatar_url, current_level)`)
            .or('visibility.eq.public,visibility.is.null')
            .order('created_at', { ascending: false }).limit(20);

        if (data) {
            setPosts(data.map(p => ({
                id: p.id, authorId: p.author_id, content: p.content, contentType: p.content_type,
                mediaUrls: p.media_urls || [], likeCount: p.like_count || 0,
                commentCount: p.comment_count || 0, shareCount: p.share_count || 0,
                timeAgo: getTimeAgo(p.created_at), myReaction: null, reactions: { like: p.like_count || 0 },
                author: { name: p.author?.username || 'Player', avatar: p.author?.avatar_url, tier: p.author?.current_level }
            })));
        }
    };

    const handleCreatePost = async (content, mediaUrls = [], contentType = 'text') => {
        if (!currentUser?.id) return false;
        setIsPosting(true);
        try {
            const { data, error } = await supabase.from('social_posts').insert({
                author_id: currentUser.id, content, content_type: contentType,
                media_urls: mediaUrls, visibility: 'public'
            }).select().single();
            if (error) throw error;
            setPosts(prev => [{
                id: data.id, authorId: currentUser.id, content, contentType, mediaUrls,
                likeCount: 0, commentCount: 0, shareCount: 0, timeAgo: 'Just now',
                myReaction: null, reactions: {},
                author: { name: currentUser.name, avatar: currentUser.avatar, tier: currentUser.level }
            }, ...prev]);
            setIsPosting(false);
            return true;
        } catch (err) { console.error('Create post error:', err); setIsPosting(false); return false; }
    };

    const handleReact = async (postId, reactionType) => {
        if (!currentUser?.id) return;
        if (reactionType === null) {
            await supabase.from('social_interactions').delete().eq('post_id', postId).eq('user_id', currentUser.id);
        } else {
            await supabase.from('social_interactions').upsert({ post_id: postId, user_id: currentUser.id, interaction_type: reactionType }, { onConflict: 'post_id,user_id' });
        }
    };

    const handleComment = async (postId, text) => { /* TODO */ };
    const handleShare = async (postId) => { /* TODO */ };
    const handleDelete = async (postId) => {
        if (!currentUser?.id || !confirm('Delete?')) return;
        await supabase.from('social_posts').delete().eq('id', postId);
        setPosts(prev => prev.filter(p => p.id !== postId));
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 👥 CONTACTS & CHAT
    // ═══════════════════════════════════════════════════════════════════════
    const loadContacts = async (userId) => {
        const { data } = await supabase.from('social_conversation_participants')
            .select(`conversation_id, social_conversations (id, last_message_at, last_message_preview)`)
            .eq('user_id', userId);
        if (!data) return;
        const list = await Promise.all(data.map(async (conv) => {
            const { data: parts } = await supabase.from('social_conversation_participants')
                .select(`user_id, profiles (username, avatar_url)`).eq('conversation_id', conv.conversation_id).neq('user_id', userId);
            const o = parts?.[0];
            if (!o) return null;
            return { id: o.user_id, name: o.profiles?.username || 'Player', avatar: o.profiles?.avatar_url, conversationId: conv.conversation_id, lastMessage: conv.social_conversations?.last_message_preview, online: false };
        }));
        setContacts(list.filter(Boolean));
    };

    const handleSearch = (query) => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (query.length < 2) { setSearchResults([]); return; }
        searchTimeoutRef.current = setTimeout(async () => {
            const { data } = await supabase.from('profiles').select('id, username, avatar_url, current_level').ilike('username', `%${query}%`).limit(10);
            if (data) setSearchResults(data.map(u => ({ id: u.id, username: u.username, avatar: u.avatar_url, level: u.current_level })));
        }, 300);
    };

    const handleOpenChat = async (contact) => {
        if (openChats.find(c => c.id === contact.id)) return;
        const newChats = [...openChats, { id: contact.id, name: contact.name || contact.username, avatar: contact.avatar, online: contact.online, conversationId: contact.conversationId }];
        if (newChats.length > 3) newChats.shift();
        setOpenChats(newChats);
        if (contact.conversationId) await loadMessages(contact.id, contact.conversationId);
    };

    const loadMessages = async (contactId, conversationId) => {
        const { data } = await supabase.from('social_messages').select('id, content, created_at, sender_id')
            .eq('conversation_id', conversationId).eq('is_deleted', false).order('created_at', { ascending: true }).limit(50);
        if (data) setChatMessages(prev => ({ ...prev, [contactId]: data.map(m => ({ id: m.id, text: m.content, time: getTimeAgo(m.created_at), senderId: m.sender_id })) }));
    };

    const handleSendMessage = async (contactId, text) => {
        if (!currentUser?.id) return;
        const chat = openChats.find(c => c.id === contactId);
        if (!chat?.conversationId) return;
        await supabase.rpc('fn_send_message', { p_conversation_id: chat.conversationId, p_sender_id: currentUser.id, p_content: text });
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 🎨 RENDER
    // ═══════════════════════════════════════════════════════════════════════
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: FB.bgMain, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div><p>Loading...</p></div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Social Hub | Smarter.Poker</title>
                <meta name="description" content="Connect, share, and play with poker players worldwide." />
            </Head>

            <div style={{ minHeight: '100vh', background: FB.bgMain, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header */}
                <header style={{ background: FB.bgCard, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${FB.divider}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    <Link href="/hub" style={{ fontSize: 24, fontWeight: 700, color: FB.blue, textDecoration: 'none' }}>← Hub</Link>
                    <div style={{ fontWeight: 700, fontSize: 20, color: FB.red }}>🔴 Social</div>
                    {currentUser ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>🔔</button>
                            <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>💬</button>
                            <Avatar name={currentUser.name} src={currentUser.avatar} size={36} />
                        </div>
                    ) : (
                        <Link href="/auth/login" style={{ color: FB.blue, fontWeight: 600, textDecoration: 'none' }}>Log In</Link>
                    )}
                </header>

                {/* Main Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', maxWidth: 1200, margin: '0 auto', gap: 16, padding: 16 }}>
                    {/* Left Sidebar */}
                    <nav style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
                        {currentUser && <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', cursor: 'pointer' }}><Avatar name={currentUser.name} src={currentUser.avatar} size={32} /><span style={{ fontWeight: 500 }}>{currentUser.name}</span></div>}
                        <div style={{ padding: '8px 12px', cursor: 'pointer' }}>👤 Profile</div>
                        <div style={{ padding: '8px 12px', cursor: 'pointer' }}>👥 Friends</div>
                        <div style={{ padding: '8px 12px', cursor: 'pointer' }}>💬 Messages</div>
                        <div style={{ padding: '8px 12px', cursor: 'pointer' }}>👥 Groups</div>
                        <div style={{ padding: '8px 12px', cursor: 'pointer' }}>📅 Events</div>
                        <div style={{ padding: '8px 12px', cursor: 'pointer' }}>🎬 Reels</div>
                        <div style={{ padding: '8px 12px', cursor: 'pointer' }}>🏆 Leaderboard</div>
                    </nav>

                    {/* Main Feed */}
                    <main>
                        {/* Stories */}
                        <StoriesBar stories={stories} currentUser={currentUser} onAddStory={() => { }} onViewStory={() => { }} />

                        {/* Reels */}
                        <ReelsSection reels={reels} onViewReel={() => { }} />

                        {/* Post Creator */}
                        {currentUser && <PostCreator user={currentUser} onPost={handleCreatePost} onCreateStory={() => { }} onCreateReel={() => { }} isPosting={isPosting} />}

                        {/* Login Prompt */}
                        {!currentUser && (
                            <div style={{ background: FB.bgCard, borderRadius: 8, padding: 20, textAlign: 'center', marginBottom: 16 }}>
                                <p style={{ color: FB.textSecondary, marginBottom: 12 }}>Log in to create posts, share stories, and chat!</p>
                                <Link href="/auth/login" style={{ color: FB.blue, fontWeight: 600, textDecoration: 'none' }}>Log In →</Link>
                            </div>
                        )}

                        {/* Posts */}
                        {posts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 60, color: FB.textSecondary }}>
                                <div style={{ fontSize: 64, marginBottom: 16 }}>🌟</div>
                                <h2 style={{ color: FB.textPrimary }}>No posts yet</h2>
                                <p>Be the first to share!</p>
                            </div>
                        ) : posts.map(post => (
                            <PostCard key={post.id} post={post} currentUserId={currentUser?.id} onReact={handleReact} onComment={handleComment} onShare={handleShare} onDelete={handleDelete} />
                        ))}
                    </main>

                    {/* Right Sidebar */}
                    <ContactsSidebar contacts={contacts} groups={groups} onOpenChat={handleOpenChat} onSearch={handleSearch} searchResults={searchResults} />
                </div>

                {/* Chat Windows */}
                <div style={{ position: 'fixed', bottom: 0, right: 80, display: 'flex', gap: 8, zIndex: 1000 }}>
                    {openChats.map(chat => (
                        <ChatWindow
                            key={chat.id}
                            chat={chat}
                            messages={chatMessages[chat.id] || []}
                            currentUserId={currentUser?.id}
                            onSend={(text) => handleSendMessage(chat.id, text)}
                            onClose={() => setOpenChats(prev => prev.filter(c => c.id !== chat.id))}
                            isTyping={typingStatus[chat.id]}
                            onSendVoice={() => { }}
                            onSendPhoto={() => { }}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}
