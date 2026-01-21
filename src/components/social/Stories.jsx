/**
 * STORIES COMPONENT - Facebook-style 24-hour Stories
 * Features: Story bar, full-screen viewer, create modal, share to story
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A',
};

// Gradient backgrounds for text-only stories
const STORY_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
];

// Story Ring - shows colored ring for unviewed stories
function StoryRing({ hasUnviewed, children, size = 64, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                width: size + 8,
                height: size + 8,
                borderRadius: '50%',
                background: hasUnviewed
                    ? 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)'
                    : '#DADDE1',
                padding: 3,
                cursor: 'pointer',
            }}
        >
            <div style={{
                width: size + 2,
                height: size + 2,
                borderRadius: '50%',
                background: 'white',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {children}
            </div>
        </div>
    );
}

// Story Avatar - individual story in the bar
function StoryAvatar({ story, onClick, isOwn, hasStory, onCreateStory }) {
    const hasUnviewed = !story?.is_viewed && !isOwn;

    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                minWidth: 80,
                position: 'relative',
            }}
        >
            <StoryRing hasUnviewed={hasUnviewed} size={64}>
                <div style={{ position: 'relative' }}>
                    <img
                        src={story?.author_avatar || '/default-avatar.png'}
                        style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    {/* Plus badge on avatar for "Your Story" */}
                    {isOwn && (
                        <div
                            onClick={(e) => { e.stopPropagation(); onCreateStory?.(); }}
                            style={{
                                position: 'absolute', bottom: -2, right: -2,
                                width: 24, height: 24, borderRadius: '50%',
                                background: C.blue, border: '3px solid white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 16, color: 'white', fontWeight: 700,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            }}>+</div>
                    )}
                </div>
            </StoryRing>
            <span style={{
                fontSize: 12,
                color: C.text,
                textAlign: 'center',
                maxWidth: 70,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {isOwn ? 'Your Story' : (story?.author_username || 'User')}
            </span>
            {/* Plus button below "Your Story" */}
            {isOwn && (
                <div
                    onClick={(e) => { e.stopPropagation(); onCreateStory?.(); }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: C.blue,
                        borderRadius: 16,
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 600,
                        marginTop: 2,
                        boxShadow: '0 2px 6px rgba(24, 119, 242, 0.4)',
                    }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>+</span>
                    Add
                </div>
            )}
        </div>
    );
}

// Stories Bar - horizontal scroll of stories at top of feed
export function StoriesBar({ userId, onCreateStory }) {
    const [stories, setStories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewingStory, setViewingStory] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (userId) loadStories();
    }, [userId]);

    const loadStories = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('fn_get_stories', { p_viewer_id: userId });
            if (data) {
                // Group stories by author
                const grouped = {};
                data.forEach(story => {
                    if (!grouped[story.author_id]) {
                        grouped[story.author_id] = {
                            ...story,
                            stories: [story],
                        };
                    } else {
                        grouped[story.author_id].stories.push(story);
                    }
                });
                setStories(Object.values(grouped));
            }
        } catch (e) {
            console.error('Error loading stories:', e);
        }
        setLoading(false);
    };

    const handleViewStory = async (storyGroup) => {
        setViewingStory(storyGroup);
        // Record view
        if (!storyGroup.is_own) {
            await supabase.rpc('fn_view_story', {
                p_story_id: storyGroup.id,
                p_viewer_id: userId,
            });
        }
    };

    // Check if user has their own story
    const ownStory = stories.find(s => s.is_own);
    const otherStories = stories.filter(s => !s.is_own);

    return (
        <>
            <div style={{
                background: C.card,
                borderRadius: 8,
                padding: '12px 8px',
                marginBottom: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}>
                <div
                    ref={scrollRef}
                    style={{
                        display: 'flex',
                        gap: 8,
                        overflowX: 'auto',
                        paddingBottom: 8,
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                    }}
                >
                    {/* Your Story (always first) */}
                    <StoryAvatar
                        story={ownStory || { author_avatar: null }}
                        isOwn={true}
                        hasStory={!!ownStory}
                        onClick={() => ownStory ? handleViewStory(ownStory) : setShowCreate(true)}
                        onCreateStory={() => setShowCreate(true)}
                    />

                    {/* Other stories */}
                    {otherStories.map(storyGroup => (
                        <StoryAvatar
                            key={storyGroup.author_id}
                            story={storyGroup}
                            onClick={() => handleViewStory(storyGroup)}
                        />
                    ))}

                    {loading && !stories.length && (
                        <div style={{ padding: '20px 40px', color: C.textSec }}>Loading stories...</div>
                    )}
                </div>
            </div>

            {/* Story Viewer Modal */}
            {viewingStory && (
                <StoryViewer
                    storyGroup={viewingStory}
                    onClose={() => { setViewingStory(null); loadStories(); }}
                    userId={userId}
                />
            )}

            {/* Create Story Modal */}
            {showCreate && (
                <CreateStoryModal
                    userId={userId}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); loadStories(); }}
                />
            )}
        </>
    );
}

// Full-screen Story Viewer
function StoryViewer({ storyGroup, onClose, userId }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const stories = storyGroup.stories || [storyGroup];
    const currentStory = stories[currentIndex];
    const timerRef = useRef(null);

    // Auto-advance timer (5 seconds per story)
    useEffect(() => {
        setProgress(0);
        const duration = 5000; // 5 seconds
        const interval = 50; // Update every 50ms
        let elapsed = 0;

        timerRef.current = setInterval(() => {
            elapsed += interval;
            setProgress((elapsed / duration) * 100);

            if (elapsed >= duration) {
                // Move to next story or close
                if (currentIndex < stories.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                } else {
                    onClose();
                }
            }
        }, interval);

        return () => clearInterval(timerRef.current);
    }, [currentIndex]);

    const goNext = () => {
        if (currentIndex < stories.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const goPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            {/* Close button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 20, right: 20,
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none', color: 'white', fontSize: 24,
                    cursor: 'pointer', zIndex: 10,
                }}
            >✕</button>

            {/* Story container */}
            <div style={{
                width: '100%',
                maxWidth: 420,
                height: '90vh',
                maxHeight: 800,
                borderRadius: 12,
                overflow: 'hidden',
                position: 'relative',
                background: currentStory.background_color || currentStory.media_url ? 'black' : STORY_GRADIENTS[0],
            }}>
                {/* Progress bars */}
                <div style={{
                    position: 'absolute', top: 8, left: 8, right: 8,
                    display: 'flex', gap: 4, zIndex: 10,
                }}>
                    {stories.map((_, i) => (
                        <div key={i} style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: 'rgba(255,255,255,0.3)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%',
                                background: 'white',
                                width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%',
                                transition: i === currentIndex ? 'none' : 'width 0.3s',
                            }} />
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div style={{
                    position: 'absolute', top: 20, left: 12, right: 12,
                    display: 'flex', alignItems: 'center', gap: 12,
                    zIndex: 10,
                }}>
                    <img
                        src={currentStory.author_avatar || '/default-avatar.png'}
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
                            {currentStory.author_fullname || currentStory.author_username}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                            {timeAgo(currentStory.created_at)}
                        </div>
                    </div>
                </div>

                {/* Story content */}
                {currentStory.media_url ? (
                    currentStory.media_type === 'video' ? (
                        <video
                            src={currentStory.media_url}
                            autoPlay
                            muted
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <img
                            src={currentStory.media_url}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    )
                ) : (
                    <div style={{
                        width: '100%', height: '100%',
                        background: currentStory.background_color || STORY_GRADIENTS[0],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 40,
                    }}>
                        <p style={{
                            color: 'white', fontSize: 28, fontWeight: 700,
                            textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        }}>
                            {currentStory.content}
                        </p>
                    </div>
                )}

                {/* Text overlay if both media and content */}
                {currentStory.media_url && currentStory.content && (
                    <div style={{
                        position: 'absolute', bottom: 80, left: 20, right: 20,
                        color: 'white', fontSize: 18, fontWeight: 500,
                        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                        textAlign: 'center',
                    }}>
                        {currentStory.content}
                    </div>
                )}

                {/* Navigation touch areas */}
                <div
                    onClick={goPrev}
                    style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0, width: '30%',
                        cursor: 'pointer',
                    }}
                />
                <div
                    onClick={goNext}
                    style={{
                        position: 'absolute', top: 0, right: 0, bottom: 0, width: '70%',
                        cursor: 'pointer',
                    }}
                />

                {/* View count for own stories */}
                {storyGroup.is_own && (
                    <div style={{
                        position: 'absolute', bottom: 20, left: 20,
                        color: 'white', fontSize: 14,
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        👁 {currentStory.view_count || 0} views
                    </div>
                )}
            </div>
        </div>
    );
}

// Time ago helper
function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

// Create Story Modal
function CreateStoryModal({ userId, onClose, onCreated }) {
    const [mode, setMode] = useState('text'); // 'text' or 'media' or 'link'
    const [text, setText] = useState('');
    const [selectedGradient, setSelectedGradient] = useState(0);
    const [mediaUrl, setMediaUrl] = useState(null);
    const [mediaType, setMediaType] = useState('image');
    const [uploading, setUploading] = useState(false);
    const [creating, setCreating] = useState(false);
    const fileInputRef = useRef(null);

    // 🔗 LINK PREVIEW STATE
    const [linkPreview, setLinkPreview] = useState(null);
    const [fetchingPreview, setFetchingPreview] = useState(false);
    const linkTimeoutRef = useRef(null);

    // Detect URLs in text and fetch preview
    const detectAndFetchLink = async (inputText) => {
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const matches = inputText.match(urlRegex);

        if (matches && matches.length > 0) {
            const url = matches[0];

            // Don't refetch same URL
            if (linkPreview?.url === url) return;

            setFetchingPreview(true);
            try {
                // Use a CORS proxy or API route to fetch OG data
                // For now, use a simple approach with a free OG API
                const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
                const data = await response.json();

                if (data.status === 'success' && data.data) {
                    setLinkPreview({
                        url: url,
                        title: data.data.title || 'Link Preview',
                        description: data.data.description || '',
                        image: data.data.image?.url || data.data.logo?.url || null,
                        siteName: data.data.publisher || new URL(url).hostname,
                    });
                    setMode('link');
                }
            } catch (e) {
                console.log('Link preview failed:', e);
                // Fallback: just show the URL as title
                try {
                    const hostname = new URL(url).hostname;
                    setLinkPreview({
                        url: url,
                        title: url.slice(0, 50) + '...',
                        description: '',
                        image: null,
                        siteName: hostname,
                    });
                    setMode('link');
                } catch (urlError) {
                    // Invalid URL, ignore
                }
            }
            setFetchingPreview(false);
        }
    };

    // Handle text change with debounced link detection
    const handleTextChange = (e) => {
        const newText = e.target.value;
        setText(newText);

        // Debounce link detection
        if (linkTimeoutRef.current) clearTimeout(linkTimeoutRef.current);
        linkTimeoutRef.current = setTimeout(() => {
            detectAndFetchLink(newText);
        }, 800);
    };

    // Remove URL from text for final story
    const getCleanText = () => {
        if (!linkPreview?.url) return text;
        return text.replace(linkPreview.url, '').trim();
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const fileExt = file.name.split('.').pop();
        const isVideo = file.type.startsWith('video/');
        const filePath = `stories/${userId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('stories')
            .upload(filePath, file);

        if (uploadError) {
            alert('Error uploading: ' + uploadError.message);
            setUploading(false);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(filePath);
        setMediaUrl(publicUrl);
        setMediaType(isVideo ? 'video' : 'image');
        setMode('media');
        setLinkPreview(null); // Clear link preview when uploading media
        setUploading(false);
    };

    const handleCreate = async () => {
        if (!text && !mediaUrl && !linkPreview) return;
        setCreating(true);

        try {
            // Use link preview image as media if no other media
            const finalMediaUrl = mediaUrl || linkPreview?.image;
            const finalMediaType = mediaUrl ? mediaType : (linkPreview?.image ? 'image' : null);
            const cleanText = getCleanText();

            // Build story content - include link title if we have a link
            let storyContent = cleanText;
            if (linkPreview && !cleanText) {
                storyContent = linkPreview.title;
            }

            const { data: storyId, error } = await supabase.rpc('fn_create_story', {
                p_user_id: userId,
                p_content: storyContent || null,
                p_media_url: finalMediaUrl || null,
                p_media_type: finalMediaType,
                p_background_color: mode === 'text' ? STORY_GRADIENTS[selectedGradient] : null,
            });

            if (error) throw error;

            // Auto-save videos to Reels (permanent archive)
            if (mediaType === 'video' && mediaUrl) {
                await supabase.from('social_reels').insert({
                    author_id: userId,
                    video_url: mediaUrl,
                    caption: cleanText || null,
                    source_story_id: storyId,
                });
            }

            onCreated();
        } catch (e) {
            console.error('Create story error:', e);
            alert('Failed to create story');
        }
        setCreating(false);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div style={{
                width: '100%',
                maxWidth: 500,
                background: C.card,
                borderRadius: 12,
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    padding: 16, borderBottom: `1px solid ${C.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>✕</button>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Create Story</h3>
                    <button
                        onClick={handleCreate}
                        disabled={(!text && !mediaUrl && !linkPreview) || creating}
                        style={{
                            background: C.blue,
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            padding: '8px 16px',
                            fontWeight: 600,
                            cursor: (!text && !mediaUrl && !linkPreview) || creating ? 'not-allowed' : 'pointer',
                            opacity: (!text && !mediaUrl && !linkPreview) || creating ? 0.5 : 1,
                        }}
                    >
                        {creating ? 'Sharing...' : 'Share'}
                    </button>
                </div>

                {/* Preview */}
                <div style={{
                    height: 400,
                    background: mode === 'link' && linkPreview?.image
                        ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url(${linkPreview.image})`
                        : mode === 'text' ? STORY_GRADIENTS[selectedGradient] : '#000',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    flexDirection: 'column',
                }}>
                    {mode === 'media' && mediaUrl ? (
                        mediaType === 'video' ? (
                            <video src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '100%' }} controls />
                        ) : (
                            <img src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        )
                    ) : mode === 'link' && linkPreview ? (
                        /* 🔗 LINK PREVIEW CARD */
                        <div style={{
                            background: 'rgba(255,255,255,0.95)',
                            borderRadius: 12,
                            overflow: 'hidden',
                            width: '85%',
                            maxWidth: 350,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                        }}>
                            {linkPreview.image && (
                                <img
                                    src={linkPreview.image}
                                    style={{ width: '100%', height: 180, objectFit: 'cover' }}
                                    alt=""
                                />
                            )}
                            <div style={{ padding: 16 }}>
                                <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>
                                    {linkPreview.siteName}
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8, lineHeight: 1.3 }}>
                                    {linkPreview.title}
                                </div>
                                {linkPreview.description && (
                                    <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.4 }}>
                                        {linkPreview.description.slice(0, 100)}{linkPreview.description.length > 100 ? '...' : ''}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => { setLinkPreview(null); setMode('text'); }}
                                style={{
                                    position: 'absolute', top: 60, right: 30,
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)', border: 'none',
                                    color: 'white', fontSize: 14, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >✕</button>
                        </div>
                    ) : (
                        <>
                            <textarea
                                value={text}
                                onChange={handleTextChange}
                                placeholder="Start typing or paste a link..."
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: 24,
                                    fontWeight: 600,
                                    textAlign: 'center',
                                    width: '80%',
                                    resize: 'none',
                                    outline: 'none',
                                }}
                                rows={4}
                            />
                            {fetchingPreview && (
                                <div style={{
                                    marginTop: 16,
                                    color: 'rgba(255,255,255,0.8)',
                                    fontSize: 14,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8
                                }}>
                                    🔗 Fetching link preview...
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Options */}
                <div style={{ padding: 16 }}>
                    {mode === 'text' && (
                        <>
                            <p style={{ fontSize: 13, color: C.textSec, marginBottom: 8 }}>Background</p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {STORY_GRADIENTS.map((grad, i) => (
                                    <div
                                        key={i}
                                        onClick={() => setSelectedGradient(i)}
                                        style={{
                                            width: 40, height: 40, borderRadius: 8,
                                            background: grad, cursor: 'pointer',
                                            border: selectedGradient === i ? '3px solid ' + C.blue : 'none',
                                        }}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                        <button
                            onClick={() => setMode('text')}
                            style={{
                                flex: 1, padding: 12, borderRadius: 8,
                                background: mode === 'text' ? C.blue : C.bg,
                                color: mode === 'text' ? 'white' : C.text,
                                border: 'none', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Aa Text
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{
                                flex: 1, padding: 12, borderRadius: 8,
                                background: mode === 'media' ? C.blue : C.bg,
                                color: mode === 'media' ? 'white' : C.text,
                                border: 'none', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            {uploading ? '📤 Uploading...' : '📷 Photo/Video'}
                        </button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        hidden
                        onChange={handleFileSelect}
                    />
                </div>
            </div>
        </div>
    );
}

// Share to Story prompt (shown after posting media)
export function ShareToStoryPrompt({ mediaUrl, mediaType, userId, onClose, onShared }) {
    const [sharing, setSharing] = useState(false);

    const handleShare = async () => {
        setSharing(true);
        try {
            await supabase.rpc('fn_create_story', {
                p_user_id: userId,
                p_content: null,
                p_media_url: mediaUrl,
                p_media_type: mediaType || 'image',
                p_background_color: null,
            });
            onShared?.();
        } catch (e) {
            console.error('Share to story error:', e);
        }
        setSharing(false);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: 100, left: '50%', transform: 'translateX(-50%)',
            background: C.card,
            borderRadius: 12,
            padding: 16,
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
        }}>
            <span style={{ fontSize: 14, color: C.text }}>
                Also share to your Story?
            </span>
            <button
                onClick={handleShare}
                disabled={sharing}
                style={{
                    background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                {sharing ? '...' : '📖 Share'}
            </button>
            <button
                onClick={onClose}
                style={{
                    background: C.bg,
                    color: C.textSec,
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                }}
            >
                Not now
            </button>
        </div>
    );
}
