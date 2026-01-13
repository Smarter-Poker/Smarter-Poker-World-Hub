/* ═══════════════════════════════════════════════════════════════════════════
   SOCIAL MEDIA ORB — Facebook-Style Poker Social Network
   Orb #1: Connect with players, share hands, and build your network
   
   Version 2.0 - Complete Facebook-Style Redesign
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SocialService } from '../../src/services/SocialService';
import { EnhancedPostCreator } from '../../src/components/social/EnhancedPostCreator';

// Initialize Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Initialize SocialService
const socialService = new SocialService(supabase);

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 FB COLORS (Facebook-style theming)
// ═══════════════════════════════════════════════════════════════════════════
const FB_COLORS = {
    blue: '#1877F2',
    blueHover: '#166FE5',
    blueLight: '#E7F3FF',
    bgMain: '#F0F2F5',
    bgWhite: '#FFFFFF',
    bgHover: '#F2F2F2',
    textPrimary: '#050505',
    textSecondary: '#65676B',
    divider: '#CED0D4',
    green: '#42B72A',
    red: '#FA383E',
};

// ═══════════════════════════════════════════════════════════════════════════
// 👤 AVATAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function FBAvatar({ src, size = 40, online = false }) {
    return (
        <div style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: src ? `url(${src}) center/cover` : 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.4,
            color: 'white',
            position: 'relative',
            flexShrink: 0,
        }}>
            {!src && '👤'}
            {online && (
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: size * 0.25,
                    height: size * 0.25,
                    background: FB_COLORS.green,
                    border: `2px solid ${FB_COLORS.bgWhite}`,
                    borderRadius: '50%',
                }} />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 CREATE POST BOX
// ═══════════════════════════════════════════════════════════════════════════
function CreatePostBox({ user, onSubmit }) {
    const [content, setContent] = useState('');
    const [mediaFile, setMediaFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setMediaFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = () => {
        if (content.trim() || mediaFile) {
            onSubmit?.(content, mediaFile);
            setContent('');
            setMediaFile(null);
            setPreviewUrl(null);
        }
    };

    return (
        <div style={styles.createPost}>
            <div style={styles.createPostRow}>
                <FBAvatar src={user?.avatar} size={40} />
                <input
                    type="text"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={`What's on your mind?`}
                    style={styles.createPostInput}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
            </div>

            {/* Media Preview */}
            {previewUrl && (
                <div style={{ padding: '0 16px 12px 16px' }}>
                    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
                        {mediaFile?.type?.startsWith('video') ? (
                            <video src={previewUrl} style={{ width: '100%', maxHeight: 300, background: '#000' }} controls />
                        ) : (
                            <img src={previewUrl} alt="Preview" style={{ width: '100%', maxHeight: 300, objectFit: 'cover' }} />
                        )}
                        <button
                            onClick={() => { setMediaFile(null); setPreviewUrl(null); }}
                            style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer' }}
                        >✕</button>
                    </div>
                </div>
            )}

            <div style={styles.createPostDivider} />

            <div style={styles.createPostActions}>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                />
                <button style={styles.createPostAction}>🎮 Live Video</button>
                <button
                    style={styles.createPostAction}
                    onClick={() => fileInputRef.current?.click()}
                >
                    📷 Photo/Video
                </button>
                <button style={styles.createPostAction}>🃏 Hand History</button>
                <button
                    onClick={handleSubmit}
                    style={{
                        marginLeft: 'auto',
                        background: (content || mediaFile) ? FB_COLORS.blue : '#e4e6eb',
                        color: (content || mediaFile) ? '#fff' : '#bcc0c4',
                        padding: '6px 24px',
                        border: 'none',
                        borderRadius: 6,
                        fontWeight: 600,
                        cursor: (content || mediaFile) ? 'pointer' : 'default'
                    }}
                >
                    Post
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📄 POST CARD
// ═══════════════════════════════════════════════════════════════════════════
function FBPostCard({ post, onLike, onComment, onShare, onDelete, currentUserId }) {
    const [liked, setLiked] = useState(post.isLiked || false);
    const [likeCount, setLikeCount] = useState(post.likeCount || 0);
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Check if current user owns this post
    const isOwner = currentUserId && (post.authorId === currentUserId || post.author_id === currentUserId);

    const handleLike = async () => {
        // Optimistic UI update
        setLiked(!liked);
        setLikeCount(liked ? likeCount - 1 : likeCount + 1);

        // Call backend
        if (onLike) {
            try {
                await onLike(post.id);
            } catch (error) {
                // Revert on error
                setLiked(liked);
                setLikeCount(likeCount);
            }
        }
    };

    const handleCommentSubmit = async () => {
        if (!commentText.trim() || isSubmitting) return;

        setIsSubmitting(true);
        if (onComment) {
            try {
                await onComment(post.id, commentText);
                setCommentText('');
            } catch (error) {
                console.error('Comment failed:', error);
            }
        }
        setIsSubmitting(false);
    };

    const handleShare = () => {
        if (onShare) {
            onShare(post.id);
        }
    };

    const handleDelete = async () => {
        if (!onDelete || isDeleting) return;

        if (!confirm('Are you sure you want to delete this post?')) {
            setShowMenu(false);
            return;
        }

        setIsDeleting(true);
        try {
            await onDelete(post.id);
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete post');
        }
        setIsDeleting(false);
        setShowMenu(false);
    };

    // Handle media URLs (can be array or single string)
    const mediaUrl = post.mediaUrl || (post.mediaUrls && post.mediaUrls[0]);
    const mediaType = post.mediaType || post.contentType;

    return (
        <div style={styles.postCard}>
            {/* Header */}
            <div style={styles.postHeader}>
                <FBAvatar src={post.author?.avatar} size={40} />
                <div style={styles.postAuthorInfo}>
                    <span style={styles.postAuthorName}>{post.author?.name || 'Anonymous'}</span>
                    <span style={styles.postTime}>{post.timeAgo || 'Just now'}</span>
                </div>
                <div style={{ position: 'relative' }}>
                    <button
                        style={styles.moreBtn}
                        onClick={() => setShowMenu(!showMenu)}
                    >
                        ⋯
                    </button>
                    {showMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            background: '#fff',
                            borderRadius: 8,
                            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                            minWidth: 180,
                            zIndex: 100,
                            overflow: 'hidden'
                        }}>
                            {isOwner && (
                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        width: '100%',
                                        padding: '12px 16px',
                                        border: 'none',
                                        background: 'transparent',
                                        textAlign: 'left',
                                        cursor: isDeleting ? 'wait' : 'pointer',
                                        color: '#dc2626',
                                        fontSize: 15,
                                        fontWeight: 500
                                    }}
                                >
                                    🗑️ {isDeleting ? 'Deleting...' : 'Delete Post'}
                                </button>
                            )}
                            <button
                                onClick={() => { handleShare(); setShowMenu(false); }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    width: '100%',
                                    padding: '12px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    color: '#1c1e21',
                                    fontSize: 15
                                }}
                            >
                                📋 Copy Link
                            </button>
                            <button
                                onClick={() => setShowMenu(false)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    width: '100%',
                                    padding: '12px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    color: '#65676b',
                                    fontSize: 15
                                }}
                            >
                                ✕ Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div style={styles.postContent}>
                <p style={styles.postText}>{post.content || post.text}</p>
                {mediaUrl && (
                    <div style={{ marginTop: 12 }}>
                        {mediaType === 'video' ? (
                            <div style={{ width: '100%', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
                                <video src={mediaUrl} style={{ width: '100%', maxHeight: 500, display: 'block' }} controls />
                            </div>
                        ) : (
                            <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #ddd' }}>
                                <img src={mediaUrl} alt="Post media" style={{ width: '100%', maxHeight: 600, objectFit: 'cover', display: 'block' }} />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Hand Display */}
            {post.handData && (
                <div style={styles.handDisplay}>
                    <div style={styles.handRow}>
                        <span style={styles.handLabel}>Hero:</span>
                        <span style={styles.handCards}>{post.handData.heroCards?.join(' ')}</span>
                    </div>
                    <div style={styles.handRow}>
                        <span style={styles.handLabel}>Board:</span>
                        <span style={styles.handCards}>{post.handData.board?.join(' ')}</span>
                    </div>
                    {post.handData.won && (
                        <div style={styles.winBadge}>
                            💰 +${post.handData.amount?.toLocaleString()}
                        </div>
                    )}
                </div>
            )}

            {/* Stats */}
            <div style={styles.postStats}>
                <span>{likeCount > 0 ? `👍 ${likeCount}` : ''}</span>
                <span onClick={() => setShowComments(!showComments)} style={{ cursor: 'pointer' }}>
                    {post.commentCount > 0 ? `${post.commentCount} comments` : ''}
                </span>
            </div>

            {/* Actions */}
            <div style={styles.postActions}>
                <button
                    onClick={handleLike}
                    style={{
                        ...styles.postAction,
                        color: liked ? FB_COLORS.blue : FB_COLORS.textSecondary,
                    }}
                >
                    {liked ? '👍' : '👍'} Like
                </button>
                <button
                    style={styles.postAction}
                    onClick={() => setShowComments(!showComments)}
                >
                    💬 Comment
                </button>
                <button style={styles.postAction} onClick={handleShare}>↗️ Share</button>
            </div>

            {/* Comment Input */}
            {showComments && (
                <div style={{ padding: '12px 16px', borderTop: `1px solid ${FB_COLORS.divider}` }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Write a comment..."
                            onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit()}
                            disabled={isSubmitting}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: 'none',
                                borderRadius: 20,
                                background: '#f0f2f5',
                                fontSize: 14,
                            }}
                        />
                        <button
                            onClick={handleCommentSubmit}
                            disabled={!commentText.trim() || isSubmitting}
                            style={{
                                padding: '6px 12px',
                                background: commentText.trim() ? FB_COLORS.blue : '#e4e6eb',
                                color: commentText.trim() ? '#fff' : '#bcc0c4',
                                border: 'none',
                                borderRadius: 16,
                                cursor: commentText.trim() ? 'pointer' : 'default',
                                fontSize: 13,
                                fontWeight: 500,
                            }}
                        >
                            {isSubmitting ? '...' : 'Post'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════════════════
// 📱 LEFT SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
function LeftSidebar({ user, onNavigate }) {
    const menuItems = [
        { icon: '👤', label: 'Profile', route: 'profile' },
        { icon: '👥', label: 'Friends', route: 'friends' },
        { icon: '🎰', label: 'Clubs', route: 'clubs' },
        { icon: '📺', label: 'Watch', route: 'watch' },
        { icon: '🏆', label: 'Tournaments', route: 'tournaments' },
        { icon: '🧠', label: 'GTO Training', route: '/hub/training' },
    ];

    return (
        <aside style={styles.leftSidebar}>
            <div style={styles.sidebarItem}>
                <FBAvatar src={user?.avatar} size={36} />
                <span>{user?.name || 'You'}</span>
            </div>
            {menuItems.map((item, i) => (
                <div
                    key={i}
                    style={styles.sidebarItem}
                    onClick={() => onNavigate?.(item.route)}
                >
                    <span style={styles.sidebarIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                </div>
            ))}
            <div
                style={styles.sidebarItem}
                onClick={() => window.open('https://social.smarter.poker', '_blank')}
            >
                <span style={styles.sidebarIcon}>🌐</span>
                <span>Full Social Site</span>
            </div>
        </aside>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 RIGHT SIDEBAR (CONTACTS)
// ═══════════════════════════════════════════════════════════════════════════
function RightSidebar({ contacts = [], onOpenChat }) {
    const defaultContacts = [
        { id: 1, name: 'Mike Shark', online: true, avatar: 'https://picsum.photos/100?1' },
        { id: 2, name: 'Sarah GTO', online: true, avatar: 'https://picsum.photos/100?2' },
        { id: 3, name: 'Tom Grinder', online: false, avatar: 'https://picsum.photos/100?3' },
    ];

    const displayContacts = contacts.length > 0 ? contacts : defaultContacts;

    return (
        <aside style={styles.rightSidebar}>
            <h4 style={styles.sidebarHeading}>Contacts</h4>
            {displayContacts.map((contact) => (
                <div
                    key={contact.id}
                    style={styles.contactItem}
                    onClick={() => onOpenChat?.(contact)}
                >
                    <FBAvatar src={contact.avatar} size={36} online={contact.online} />
                    <span style={styles.contactName}>{contact.name}</span>
                </div>
            ))}
        </aside>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT WINDOW - Full Featured with Read Receipts
// ═══════════════════════════════════════════════════════════════════════════
function ChatWindow({
    chat,
    messages = [],
    onClose,
    onSend,
    onMarkRead,
    readReceiptsEnabled = true,
    onToggleReadReceipts,
    currentUserId
}) {
    const [message, setMessage] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Mark messages as read when chat opens or new messages arrive
    useEffect(() => {
        if (messages.length > 0 && onMarkRead) {
            onMarkRead(chat.id);
        }
    }, [messages.length, chat.id, onMarkRead]);

    const handleSend = () => {
        if (message.trim()) {
            onSend?.(chat.id, message);
            setMessage('');
            inputRef.current?.focus();
        }
    };

    const getReadStatus = (msg) => {
        if (!msg.fromMe) return null;

        const readByOthers = (msg.readBy || []).filter(r => r.userId !== currentUserId);

        if (readByOthers.length > 0) {
            return { status: 'read', text: 'Seen' };
        }
        if (msg.id) {
            return { status: 'delivered', text: 'Delivered' };
        }
        return { status: 'sent', text: 'Sent' };
    };

    return (
        <div style={styles.chatWindow}>
            {/* Header with settings */}
            <div style={styles.chatHeader}>
                <FBAvatar src={chat.avatar} size={32} online={chat.online} />
                <span style={styles.chatName}>{chat.name}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        style={styles.chatSettingsBtn}
                        title="Chat Settings"
                    >
                        ⚙️
                    </button>
                    <button onClick={() => onClose?.(chat.id)} style={styles.chatClose}>×</button>
                </div>
            </div>

            {/* Settings Dropdown */}
            {showSettings && (
                <div style={styles.chatSettingsDropdown}>
                    <label style={styles.settingsLabel}>
                        <input
                            type="checkbox"
                            checked={readReceiptsEnabled}
                            onChange={(e) => {
                                onToggleReadReceipts?.(e.target.checked);
                                setShowSettings(false);
                            }}
                            style={styles.settingsCheckbox}
                        />
                        <span>Read Receipts</span>
                        <span style={styles.settingsHint}>
                            {readReceiptsEnabled ? 'On' : 'Off'}
                        </span>
                    </label>
                </div>
            )}

            {/* Messages Area */}
            <div style={styles.chatMessages}>
                {messages.length === 0 ? (
                    <div style={styles.chatEmpty}>
                        Start a conversation with {chat.name}
                    </div>
                ) : (
                    messages.map((msg, i) => {
                        const readStatus = readReceiptsEnabled ? getReadStatus(msg) : null;
                        const isLastFromMe = msg.fromMe &&
                            (i === messages.length - 1 || !messages[i + 1]?.fromMe);

                        return (
                            <div key={msg.id || i} style={styles.msgWrapper}>
                                <div style={{
                                    ...styles.msgBubble,
                                    ...(msg.fromMe ? styles.msgBubbleMe : styles.msgBubbleThem),
                                }}>
                                    {msg.text}
                                </div>
                                {/* Read Receipt Status - Only show on last message from user */}
                                {readReceiptsEnabled && isLastFromMe && readStatus && (
                                    <div style={styles.readReceipt}>
                                        {readStatus.status === 'read' && (
                                            <span style={styles.readReceiptSeen}>✓✓ {readStatus.text}</span>
                                        )}
                                        {readStatus.status === 'delivered' && (
                                            <span style={styles.readReceiptDelivered}>✓ {readStatus.text}</span>
                                        )}
                                        {readStatus.status === 'sent' && (
                                            <span style={styles.readReceiptSent}>○ {readStatus.text}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {/* Typing Indicator */}
                {isTyping && (
                    <div style={styles.typingIndicator}>
                        <span style={styles.typingDot}>●</span>
                        <span style={styles.typingDot}>●</span>
                        <span style={styles.typingDot}>●</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={styles.chatInput}>
                <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Aa"
                    style={styles.chatTextField}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button
                    onClick={handleSend}
                    style={{
                        ...styles.chatSendBtn,
                        opacity: message.trim() ? 1 : 0.5,
                    }}
                    disabled={!message.trim()}
                >
                    ➤
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏠 NAVIGATION BAR
// ═══════════════════════════════════════════════════════════════════════════
function NavBar({ user, activeTab, onTabChange, onBack, onNotifClick, onMessengerClick }) {
    const tabs = [
        { id: 'feed', icon: '🏠', label: 'Home' },
        { id: 'watch', icon: '📺', label: 'Watch' },
        { id: 'clubs', icon: '👥', label: 'Clubs' },
        { id: 'profile', icon: '👤', label: 'Profile' },
    ];

    return (
        <nav style={styles.navbar}>
            {/* Left: Logo */}
            <div style={styles.navLeft}>
                <button onClick={onBack} style={styles.backBtn}>
                    ← Hub
                </button>
                <span style={styles.logo}>🔴 Social</span>
            </div>

            {/* Center: Tabs */}
            <div style={styles.navCenter}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        style={{
                            ...styles.navTab,
                            ...(activeTab === tab.id ? styles.navTabActive : {}),
                        }}
                    >
                        <span style={{ fontSize: 20 }}>{tab.icon}</span>
                    </button>
                ))}
            </div>

            {/* Right: User */}
            <div style={styles.navRight}>
                <button onClick={onNotifClick} style={styles.navIcon}>🔔</button>
                <button onClick={onMessengerClick} style={styles.navIcon}>💬</button>
                <FBAvatar src={user?.avatar} size={40} />
            </div>
        </nav>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌟 STORIES ROW
// ═══════════════════════════════════════════════════════════════════════════
function StoriesRow({ user }) {
    const stories = [
        { id: 'create', isCreate: true, user },
        { id: 1, user: { name: 'Mike' }, thumbnail: 'https://picsum.photos/200/300?1' },
        { id: 2, user: { name: 'Sarah' }, thumbnail: 'https://picsum.photos/200/300?2' },
        { id: 3, user: { name: 'Tom' }, thumbnail: 'https://picsum.photos/200/300?3' },
    ];

    return (
        <div style={styles.storiesRow}>
            {stories.map((story) => (
                <div key={story.id} style={styles.storyCard}>
                    {story.isCreate ? (
                        <>
                            <div style={styles.storyBg} />
                            <div style={styles.createStoryBtn}>+</div>
                            <span style={styles.storyName}>Create Story</span>
                        </>
                    ) : (
                        <>
                            <div style={{
                                ...styles.storyBg,
                                backgroundImage: `url(${story.thumbnail})`,
                            }} />
                            <span style={styles.storyName}>{story.user.name}</span>
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📄 MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SocialMediaPage() {
    const router = useRouter();
    const { tab } = router.query;
    const [activeTab, setActiveTab] = useState(tab || 'feed');
    const [posts, setPosts] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Chat & Panel State
    const [openChats, setOpenChats] = useState([]);
    const [chatMessages, setChatMessages] = useState({}); // { chatId: [{ id, text, fromMe, timestamp, readBy }] }
    const [conversationIds, setConversationIds] = useState({}); // { participantId: conversationId }
    const [messagingSettings, setMessagingSettings] = useState({ read_receipts_enabled: true });
    const [showMessenger, setShowMessenger] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const subscriptionsRef = useRef(new Map());

    // Load user messaging settings
    useEffect(() => {
        async function loadSettings() {
            if (!currentUser?.id) return;

            try {
                const { data, error } = await supabase
                    .from('social_messaging_settings')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .single();

                if (error && error.code === 'PGRST116') {
                    // No settings found, create default
                    await supabase.from('social_messaging_settings').upsert({
                        user_id: currentUser.id,
                        read_receipts_enabled: true,
                    });
                    setMessagingSettings({ read_receipts_enabled: true });
                } else if (data) {
                    setMessagingSettings(data);
                }
            } catch (err) {
                console.error('Error loading messaging settings:', err);
            }
        }
        loadSettings();
    }, [currentUser?.id]);

    // Toggle read receipts globally
    const toggleReadReceipts = async (enabled) => {
        if (!currentUser?.id) return;

        try {
            await supabase.from('social_messaging_settings').upsert({
                user_id: currentUser.id,
                read_receipts_enabled: enabled,
                updated_at: new Date().toISOString(),
            });
            setMessagingSettings(prev => ({ ...prev, read_receipts_enabled: enabled }));
        } catch (err) {
            console.error('Error updating settings:', err);
        }
    };

    // Get or create conversation with a participant
    const getOrCreateConversation = async (participantId) => {
        if (!currentUser?.id) return null;

        // Check cache first
        if (conversationIds[participantId]) {
            return conversationIds[participantId];
        }

        try {
            const { data, error } = await supabase.rpc('fn_get_or_create_conversation', {
                user1_id: currentUser.id,
                user2_id: participantId,
            });

            if (error) throw error;

            setConversationIds(prev => ({ ...prev, [participantId]: data }));
            return data;
        } catch (err) {
            console.error('Error getting/creating conversation:', err);
            return null;
        }
    };

    // Load messages for a conversation
    const loadMessages = async (conversationId, participantId) => {
        try {
            const { data, error } = await supabase
                .from('social_messages')
                .select(`
                    id,
                    content,
                    created_at,
                    sender_id,
                    social_message_reads (
                        user_id,
                        read_at
                    )
                `)
                .eq('conversation_id', conversationId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const messages = (data || []).map(msg => ({
                id: msg.id,
                text: msg.content,
                timestamp: msg.created_at,
                fromMe: msg.sender_id === currentUser?.id,
                senderId: msg.sender_id,
                readBy: (msg.social_message_reads || []).map(r => ({
                    userId: r.user_id,
                    readAt: r.read_at,
                })),
            }));

            setChatMessages(prev => ({ ...prev, [participantId]: messages }));
            return messages;
        } catch (err) {
            console.error('Error loading messages:', err);
            return [];
        }
    };

    // Subscribe to real-time messages for a conversation
    const subscribeToConversation = (conversationId, participantId) => {
        const channelKey = `conv:${conversationId}`;

        // Don't re-subscribe
        if (subscriptionsRef.current.has(channelKey)) return;

        const channel = supabase
            .channel(channelKey)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    const newMsg = {
                        id: payload.new.id,
                        text: payload.new.content,
                        timestamp: payload.new.created_at,
                        fromMe: payload.new.sender_id === currentUser?.id,
                        senderId: payload.new.sender_id,
                        readBy: [],
                    };

                    setChatMessages(prev => ({
                        ...prev,
                        [participantId]: [...(prev[participantId] || []), newMsg],
                    }));
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_message_reads',
                },
                (payload) => {
                    // Update read status on messages
                    setChatMessages(prev => {
                        const msgs = prev[participantId] || [];
                        return {
                            ...prev,
                            [participantId]: msgs.map(msg =>
                                msg.id === payload.new.message_id
                                    ? {
                                        ...msg,
                                        readBy: [...(msg.readBy || []), {
                                            userId: payload.new.user_id,
                                            readAt: payload.new.read_at,
                                        }],
                                    }
                                    : msg
                            ),
                        };
                    });
                }
            )
            .subscribe();

        subscriptionsRef.current.set(channelKey, channel);
    };

    // Open chat with a contact
    const handleOpenChat = async (contact) => {
        if (!openChats.find(c => c.id === contact.id)) {
            setOpenChats([...openChats, contact]);

            // Get or create conversation
            const convId = await getOrCreateConversation(contact.id);
            if (convId) {
                // Load existing messages
                await loadMessages(convId, contact.id);
                // Subscribe to real-time updates
                subscribeToConversation(convId, contact.id);
            }
        }
    };

    // Close chat
    const handleCloseChat = (chatId) => {
        setOpenChats(openChats.filter(c => c.id !== chatId));

        // Unsubscribe from real-time
        const convId = conversationIds[chatId];
        if (convId) {
            const channelKey = `conv:${convId}`;
            const channel = subscriptionsRef.current.get(channelKey);
            if (channel) {
                supabase.removeChannel(channel);
                subscriptionsRef.current.delete(channelKey);
            }
        }
    };

    // Send message with full Supabase integration
    const handleSendMessage = async (chatId, message) => {
        // Create message locally first (works for all users)
        const tempId = `local-${Date.now()}`;
        const newMsg = {
            id: tempId,
            text: message,
            fromMe: true,
            timestamp: new Date().toISOString(),
            senderId: currentUser?.id || 'anonymous',
            readBy: currentUser?.id
                ? [{ userId: currentUser.id, readAt: new Date().toISOString() }]
                : [],
            synced: false,
        };

        // Optimistic update - always add message locally
        setChatMessages(prev => ({
            ...prev,
            [chatId]: [...(prev[chatId] || []), newMsg],
        }));

        // If user is authenticated, try to sync to database
        if (currentUser?.id) {
            const convId = conversationIds[chatId] || await getOrCreateConversation(chatId);

            if (convId) {
                try {
                    // Send to Supabase using RPC
                    const { data: messageId, error } = await supabase.rpc('fn_send_message', {
                        p_conversation_id: convId,
                        p_sender_id: currentUser.id,
                        p_content: message,
                    });

                    if (error) throw error;

                    // Update with real ID and mark as synced
                    setChatMessages(prev => ({
                        ...prev,
                        [chatId]: (prev[chatId] || []).map(msg =>
                            msg.id === tempId
                                ? { ...msg, id: messageId, synced: true }
                                : msg
                        ),
                    }));
                } catch (err) {
                    console.warn('Message saved locally only (DB sync failed):', err.message);
                    // Keep the message locally - mark synced as false
                    setChatMessages(prev => ({
                        ...prev,
                        [chatId]: (prev[chatId] || []).map(msg =>
                            msg.id === tempId
                                ? { ...msg, synced: false }
                                : msg
                        ),
                    }));
                }
            }
        }
    };

    // Mark conversation as read
    const handleMarkRead = async (chatId) => {
        if (!currentUser?.id || !messagingSettings.read_receipts_enabled) return;

        const convId = conversationIds[chatId];
        if (!convId) return;

        try {
            await supabase.rpc('fn_mark_messages_read', {
                p_conversation_id: convId,
                p_user_id: currentUser.id,
            });
        } catch (err) {
            console.error('Error marking messages read:', err);
        }
    };

    // Cleanup subscriptions on unmount
    useEffect(() => {
        return () => {
            subscriptionsRef.current.forEach((channel) => {
                supabase.removeChannel(channel);
            });
            subscriptionsRef.current.clear();
        };
    }, []);

    // Load user and posts
    useEffect(() => {
        async function loadData() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .single();

                    setCurrentUser({
                        id: user.id,
                        name: profile?.username || user.email,
                        avatar: profile?.avatar_url,
                    });
                } else {
                    // Demo user for testing when not authenticated
                    // This allows testing social features without requiring login
                    console.log('🎭 No authenticated user found, using demo user for testing');
                    setCurrentUser({
                        id: 'demo-user-001',
                        name: 'Demo Player',
                        avatar: 'https://ui-avatars.com/api/?name=Demo+Player&background=1877F2&color=fff',
                    });
                }

                // Load posts using SocialService (uses fn_get_social_feed RPC)
                try {
                    const userId = user?.id || null;
                    const { posts: feedPosts } = await socialService.getFeed({
                        userId,
                        filter: 'recent',
                        limit: 20,
                        offset: 0
                    });

                    if (feedPosts && feedPosts.length > 0) {
                        setPosts(feedPosts.map(p => ({
                            id: p.id,
                            content: p.content,
                            author: {
                                name: p.author?.username || 'Anonymous',
                                avatar: p.author?.avatarUrl,
                                tier: p.author?.tier,
                            },
                            likeCount: p.engagement?.likeCount || 0,
                            commentCount: p.engagement?.commentCount || 0,
                            shareCount: p.engagement?.shareCount || 0,
                            timeAgo: p.relativeTime || getTimeAgo(p.createdAt),
                            handData: p.achievementData,
                            mediaUrls: p.mediaUrls,
                            contentType: p.contentType,
                            isLiked: p.isLiked,
                        })));
                    }
                } catch (feedError) {
                    console.warn('Feed RPC failed, falling back to direct query:', feedError.message);
                    // Fallback: direct query without joins (basic posts only)
                    const { data: postsData } = await supabase
                        .from('social_posts')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(20);

                    if (postsData) {
                        setPosts(postsData.map(p => ({
                            id: p.id,
                            content: p.content,
                            author: { name: 'Anonymous', avatar: null },
                            likeCount: p.like_count || 0,
                            commentCount: p.comment_count || 0,
                            timeAgo: getTimeAgo(p.created_at),
                        })));
                    }
                }
            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, []);

    const getTimeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        return `${Math.floor(seconds / 86400)}d`;
    };

    const handleCreatePost = async (content, mediaFile) => {
        if (!currentUser) {
            alert('Please log in to create a post');
            return;
        }

        if (!content || content.trim().length === 0) {
            alert('Post content cannot be empty');
            return;
        }

        try {
            let mediaUrls = [];
            let contentType = 'text';

            // Upload media to Supabase Storage if provided
            if (mediaFile) {
                const fileExt = mediaFile.name.split('.').pop();
                const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
                const bucket = mediaFile.type.startsWith('video') ? 'videos' : 'images';

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from(bucket)
                    .upload(fileName, mediaFile);

                if (uploadError) {
                    console.error('Media upload error:', uploadError);
                    // Continue without media rather than failing completely
                } else {
                    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
                    mediaUrls = [urlData.publicUrl];
                    contentType = mediaFile.type.startsWith('video') ? 'video' : 'image';
                }
            }

            // Create post using SocialService
            const newPost = await socialService.createPost({
                authorId: currentUser.id,
                content: content.trim(),
                contentType,
                mediaUrls,
                visibility: 'public'
            });

            // Add to local state with proper formatting
            const formattedPost = {
                id: newPost.id,
                content: newPost.content,
                author: {
                    name: newPost.author?.username || currentUser.name || 'You',
                    avatar: newPost.author?.avatarUrl || currentUser.avatar,
                    tier: newPost.author?.tier,
                },
                likeCount: 0,
                commentCount: 0,
                shareCount: 0,
                timeAgo: 'Just now',
                mediaUrls: newPost.mediaUrls,
                contentType: newPost.contentType,
                isLiked: false,
            };

            setPosts(prevPosts => [formattedPost, ...prevPosts]);
            console.log('✅ Post created successfully:', newPost.id);

        } catch (error) {
            console.error('Failed to create post:', error);
            alert('Failed to save post. Please try again.');
        }
    };

    // Handle like toggle
    const handleLike = async (postId) => {
        if (!currentUser) {
            alert('Please log in to like posts');
            return;
        }

        try {
            const result = await socialService.toggleReaction(postId, currentUser.id, 'like');

            // Update local state
            setPosts(prevPosts => prevPosts.map(post => {
                if (post.id === postId) {
                    return {
                        ...post,
                        isLiked: result.added,
                        likeCount: result.added ? post.likeCount + 1 : Math.max(0, post.likeCount - 1)
                    };
                }
                return post;
            }));
        } catch (error) {
            console.error('Failed to toggle like:', error);
        }
    };

    // Handle comment creation
    const handleComment = async (postId, commentContent) => {
        if (!currentUser) {
            alert('Please log in to comment');
            return;
        }

        if (!commentContent || commentContent.trim().length === 0) {
            return;
        }

        try {
            const newComment = await socialService.createComment({
                postId,
                authorId: currentUser.id,
                content: commentContent.trim()
            });

            // Update local state
            setPosts(prevPosts => prevPosts.map(post => {
                if (post.id === postId) {
                    return {
                        ...post,
                        commentCount: post.commentCount + 1,
                        latestComment: {
                            author: currentUser.name,
                            content: commentContent.trim()
                        }
                    };
                }
                return post;
            }));

            console.log('✅ Comment created:', newComment.id);
        } catch (error) {
            console.error('Failed to create comment:', error);
        }
    };

    // Handle share
    const handleShare = async (postId) => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`);
            alert('Post link copied to clipboard!');
        } catch (error) {
            console.error('Failed to share:', error);
        }
    };

    // Handle delete post
    const handleDelete = async (postId) => {
        if (!currentUser) {
            alert('Please log in to delete posts');
            return;
        }

        try {
            await socialService.deletePost(postId);

            // Remove from local state
            setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
            console.log('✅ Post deleted:', postId);
        } catch (error) {
            console.error('Failed to delete post:', error);
            throw error; // Re-throw so UI can handle it
        }
    };

    const handleTabChange = (newTab) => {
        setActiveTab(newTab);
        router.push(`/hub/social-media?tab=${newTab}`, undefined, { shallow: true });
    };

    return (
        <>
            <Head>
                <title>Social Hub — Smarter.Poker</title>
                <meta name="description" content="Connect with fellow poker players" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.pageContainer}>
                {/* Navigation Bar */}
                <NavBar
                    user={currentUser}
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    onBack={() => router.push('/hub')}
                    onNotifClick={() => setShowNotifications(!showNotifications)}
                    onMessengerClick={() => setShowMessenger(!showMessenger)}
                />

                {/* Main Layout */}
                <div style={styles.mainLayout}>
                    {/* Left Sidebar */}
                    <LeftSidebar
                        user={currentUser}
                        onNavigate={handleTabChange}
                    />

                    {/* Feed Content */}
                    <main style={styles.feedContainer}>
                        {activeTab === 'feed' && (
                            <>
                                <StoriesRow user={currentUser} />
                                <EnhancedPostCreator
                                    user={currentUser}
                                    supabase={supabase}
                                    inline={true}
                                    onPostCreated={(newPost) => {
                                        // Format the new post for local state
                                        const formattedPost = {
                                            id: newPost.id,
                                            content: newPost.content,
                                            author: {
                                                name: newPost.author?.username || currentUser?.name || 'You',
                                                avatar: newPost.author?.avatarUrl || currentUser?.avatar,
                                            },
                                            likeCount: 0,
                                            commentCount: 0,
                                            shareCount: 0,
                                            timeAgo: 'Just now',
                                            mediaUrls: newPost.mediaUrls,
                                            contentType: newPost.contentType,
                                            isLiked: false,
                                        };
                                        setPosts(prevPosts => [formattedPost, ...prevPosts]);
                                    }}
                                />

                                {loading ? (
                                    <div style={styles.loading}>Loading feed...</div>
                                ) : posts.length === 0 ? (
                                    <div style={styles.emptyFeed}>
                                        <span style={{ fontSize: 48 }}>🌟</span>
                                        <h3>Your feed is empty</h3>
                                        <p>Start by sharing your first poker moment!</p>
                                    </div>
                                ) : (
                                    posts.map(post => (
                                        <FBPostCard
                                            key={post.id}
                                            post={post}
                                            onLike={handleLike}
                                            onComment={handleComment}
                                            onShare={handleShare}
                                            onDelete={handleDelete}
                                            currentUserId={currentUser?.id}
                                        />
                                    ))
                                )}
                            </>
                        )}

                        {activeTab === 'watch' && (
                            <div style={styles.placeholder}>
                                <span style={{ fontSize: 64 }}>📺</span>
                                <h2>Watch</h2>
                                <p>Poker videos and live streams coming soon!</p>
                            </div>
                        )}

                        {activeTab === 'clubs' && (
                            <div style={styles.placeholder}>
                                <span style={{ fontSize: 64 }}>👥</span>
                                <h2>Clubs</h2>
                                <p>Join poker clubs and communities!</p>
                            </div>
                        )}

                        {activeTab === 'profile' && (
                            <div style={styles.placeholder}>
                                <span style={{ fontSize: 64 }}>👤</span>
                                <h2>Your Profile</h2>
                                <p>View and edit your poker profile!</p>
                            </div>
                        )}
                    </main>

                    {/* Right Sidebar */}
                    <RightSidebar onOpenChat={handleOpenChat} />
                </div>

                {/* Chat Windows Dock */}
                <div style={styles.chatDock}>
                    {openChats.map(chat => (
                        <ChatWindow
                            key={chat.id}
                            chat={chat}
                            messages={chatMessages[chat.id] || []}
                            onClose={handleCloseChat}
                            onSend={handleSendMessage}
                            onMarkRead={handleMarkRead}
                            readReceiptsEnabled={messagingSettings.read_receipts_enabled}
                            onToggleReadReceipts={toggleReadReceipts}
                            currentUserId={currentUser?.id}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES - Facebook-Style Design
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    pageContainer: {
        minHeight: '100vh',
        background: FB_COLORS.bgMain,
        fontFamily: 'Inter, -apple-system, sans-serif',
    },

    // Navigation
    navbar: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        background: FB_COLORS.bgWhite,
        borderBottom: `1px solid ${FB_COLORS.divider}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 1000,
    },
    navLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    backBtn: {
        padding: '8px 12px',
        background: FB_COLORS.bgMain,
        border: 'none',
        borderRadius: 6,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        color: FB_COLORS.textPrimary,
    },
    logo: {
        fontSize: 24,
        fontWeight: 700,
        color: FB_COLORS.blue,
    },
    navCenter: {
        display: 'flex',
        gap: 4,
    },
    navTab: {
        width: 110,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        color: FB_COLORS.textSecondary,
    },
    navTabActive: {
        color: FB_COLORS.blue,
        borderBottom: `3px solid ${FB_COLORS.blue}`,
        borderRadius: 0,
    },
    navRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    navIcon: {
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: FB_COLORS.bgMain,
        border: 'none',
        borderRadius: '50%',
        fontSize: 18,
        cursor: 'pointer',
    },

    // Layout
    mainLayout: {
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 72,
        minHeight: '100vh',
    },
    leftSidebar: {
        position: 'fixed',
        top: 56,
        left: 0,
        width: 280,
        height: 'calc(100vh - 56px)',
        padding: 16,
        overflowY: 'auto',
    },
    rightSidebar: {
        position: 'fixed',
        top: 56,
        right: 0,
        width: 280,
        height: 'calc(100vh - 56px)',
        padding: 16,
        overflowY: 'auto',
    },
    sidebarItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 8px',
        borderRadius: 8,
        cursor: 'pointer',
        color: FB_COLORS.textPrimary,
        fontSize: 15,
        fontWeight: 500,
    },
    sidebarIcon: {
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
    },
    sidebarHeading: {
        padding: '8px',
        fontSize: 17,
        fontWeight: 600,
        color: FB_COLORS.textSecondary,
    },
    contactItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 8,
        borderRadius: 8,
        cursor: 'pointer',
    },
    contactName: {
        fontSize: 15,
        fontWeight: 500,
        color: FB_COLORS.textPrimary,
    },

    // Feed
    feedContainer: {
        width: '100%',
        maxWidth: 680,
        padding: '0 16px',
        marginLeft: 280,
        marginRight: 280,
    },

    // Stories
    storiesRow: {
        display: 'flex',
        gap: 8,
        padding: '16px 0',
        overflowX: 'auto',
    },
    storyCard: {
        width: 112,
        height: 200,
        borderRadius: 12,
        background: FB_COLORS.bgWhite,
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
    },
    storyBg: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
    },
    createStoryBtn: {
        position: 'absolute',
        bottom: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 40,
        height: 40,
        background: FB_COLORS.blue,
        borderRadius: '50%',
        border: `4px solid ${FB_COLORS.bgWhite}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 24,
        fontWeight: 300,
    },
    storyName: {
        position: 'absolute',
        bottom: 12,
        left: 8,
        right: 8,
        fontSize: 13,
        fontWeight: 500,
        color: 'white',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        textAlign: 'center',
    },

    // Create Post
    createPost: {
        background: FB_COLORS.bgWhite,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
    createPostRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    createPostInput: {
        flex: 1,
        padding: '12px 16px',
        background: FB_COLORS.bgMain,
        border: 'none',
        borderRadius: 20,
        fontSize: 17,
        outline: 'none',
    },
    createPostDivider: {
        height: 1,
        background: FB_COLORS.divider,
        margin: '12px 0',
    },
    createPostActions: {
        display: 'flex',
        justifyContent: 'space-around',
    },
    createPostAction: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        color: FB_COLORS.textSecondary,
        cursor: 'pointer',
    },

    // Post Card
    postCard: {
        background: FB_COLORS.bgWhite,
        borderRadius: 8,
        marginBottom: 16,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
    postHeader: {
        display: 'flex',
        alignItems: 'center',
        padding: 12,
        gap: 8,
    },
    postAuthorInfo: {
        flex: 1,
    },
    postAuthorName: {
        display: 'block',
        fontWeight: 600,
        fontSize: 15,
        color: FB_COLORS.textPrimary,
    },
    postTime: {
        fontSize: 13,
        color: FB_COLORS.textSecondary,
    },
    moreBtn: {
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: '50%',
        fontSize: 20,
        cursor: 'pointer',
    },
    postContent: {
        padding: '0 12px 12px',
    },
    postText: {
        fontSize: 15,
        color: FB_COLORS.textPrimary,
        lineHeight: 1.5,
        margin: 0,
    },
    handDisplay: {
        margin: '12px 12px',
        padding: 12,
        background: FB_COLORS.bgMain,
        borderRadius: 8,
    },
    handRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    handLabel: {
        fontSize: 13,
        color: FB_COLORS.textSecondary,
        width: 50,
    },
    handCards: {
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: 2,
    },
    winBadge: {
        marginTop: 8,
        padding: '8px 12px',
        background: 'linear-gradient(135deg, #22C55E, #16A34A)',
        borderRadius: 8,
        color: 'white',
        fontWeight: 700,
        fontSize: 16,
        display: 'inline-block',
    },
    postStats: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0 12px 8px',
        fontSize: 15,
        color: FB_COLORS.textSecondary,
    },
    postActions: {
        display: 'flex',
        borderTop: `1px solid ${FB_COLORS.divider}`,
        padding: 4,
    },
    postAction: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 0',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        fontSize: 15,
        fontWeight: 600,
        color: FB_COLORS.textSecondary,
        cursor: 'pointer',
    },

    // States
    loading: {
        textAlign: 'center',
        padding: 40,
        color: FB_COLORS.textSecondary,
    },
    emptyFeed: {
        textAlign: 'center',
        padding: 60,
        background: FB_COLORS.bgWhite,
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
    placeholder: {
        textAlign: 'center',
        padding: 80,
        background: FB_COLORS.bgWhite,
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        marginTop: 16,
    },

    // Chat Dock & Windows
    chatDock: {
        position: 'fixed',
        bottom: 0,
        right: 80,
        display: 'flex',
        gap: 8,
        zIndex: 1000,
    },
    chatWindow: {
        width: 328,
        height: 450,
        background: FB_COLORS.bgWhite,
        borderRadius: '8px 8px 0 0',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
    },
    chatHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${FB_COLORS.divider}`,
    },
    chatName: {
        flex: 1,
        fontWeight: 600,
        fontSize: 15,
        color: FB_COLORS.textPrimary,
    },
    chatClose: {
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: '50%',
        fontSize: 20,
        cursor: 'pointer',
        color: FB_COLORS.textSecondary,
    },
    chatMessages: {
        flex: 1,
        padding: 12,
        overflowY: 'auto',
    },
    chatEmpty: {
        textAlign: 'center',
        color: FB_COLORS.textSecondary,
        fontSize: 14,
        marginTop: 80,
    },
    chatInput: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        borderTop: `1px solid ${FB_COLORS.divider}`,
    },
    chatTextField: {
        flex: 1,
        padding: '8px 12px',
        background: FB_COLORS.bgMain,
        border: 'none',
        borderRadius: 20,
        fontSize: 14,
        outline: 'none',
    },
    chatSendBtn: {
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: FB_COLORS.blue,
        border: 'none',
        borderRadius: '50%',
        color: 'white',
        fontSize: 14,
        cursor: 'pointer',
    },
    msgBubble: {
        maxWidth: '70%',
        padding: '8px 12px',
        borderRadius: 18,
        marginBottom: 4,
        fontSize: 14,
        lineHeight: 1.4,
    },
    msgBubbleMe: {
        marginLeft: 'auto',
        background: FB_COLORS.blue,
        color: 'white',
    },
    msgBubbleThem: {
        marginRight: 'auto',
        background: FB_COLORS.bgMain,
        color: FB_COLORS.textPrimary,
    },
    msgWrapper: {
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 4,
    },
    readReceipt: {
        textAlign: 'right',
        fontSize: 11,
        marginTop: 2,
        paddingRight: 4,
    },
    readReceiptSeen: {
        color: FB_COLORS.blue,
    },
    readReceiptDelivered: {
        color: FB_COLORS.textSecondary,
    },
    readReceiptSent: {
        color: '#AAA',
    },
    chatSettingsBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
        padding: 4,
        opacity: 0.7,
    },
    chatSettingsDropdown: {
        background: FB_COLORS.bgWhite,
        borderBottom: `1px solid ${FB_COLORS.divider}`,
        padding: 10,
    },
    settingsLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        cursor: 'pointer',
    },
    settingsCheckbox: {
        accentColor: FB_COLORS.blue,
    },
    settingsHint: {
        marginLeft: 'auto',
        color: FB_COLORS.textSecondary,
        fontSize: 12,
    },
    typingIndicator: {
        display: 'flex',
        gap: 3,
        padding: '8px 12px',
        color: FB_COLORS.textSecondary,
    },
    typingDot: {
        animation: 'pulse 1.4s infinite',
        fontSize: 10,
    },
};
