/**
 * 🎬 STORIES COMPONENT v2 - TikTok/Facebook/Instagram-Style Stories
 * 
 * KEY UX PATTERNS FROM RESEARCH:
 * 1. Full-screen camera-first interface
 * 2. Easy camera roll upload with immediate preview
 * 3. 24-hour ephemeral content with progress bars
 * 4. Text overlays, stickers, filters
 * 5. Gradient backgrounds for text-only stories
 * 6. Interactive elements (polls, questions)
 * 7. Clear visual feedback for all actions
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A',
};

// Gradient backgrounds for text-only stories
const STORY_GRADIENTS = [
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
    'linear-gradient(135deg, #0f0f23 0%, #2d1b4e 100%)',
    'linear-gradient(135deg, #1f1c2c 0%, #928DAB 100%)',
    'linear-gradient(135deg, #1877F2 0%, #0a5dc2 100%)',
    'linear-gradient(135deg, #0052D4 0%, #4364F7 50%, #6FB1FC 100%)',
    'linear-gradient(135deg, #141E30 0%, #243B55 100%)',
    'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 50%, #6B5B1E 100%)',
    'linear-gradient(135deg, #3E2723 0%, #8D6E63 100%)',
    'linear-gradient(135deg, #134E5E 0%, #71B280 100%)',
    'linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)',
    'linear-gradient(135deg, #8B0000 0%, #DC143C 100%)',
    'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)',
];

// Story Ring - shows colored ring for unviewed stories or LIVE status
function StoryRing({ hasUnviewed, isLive, children, size = 64, onClick }) {
    // Red glowing ring for live users
    const liveGradient = 'linear-gradient(135deg, #FA383E, #FF6B6B, #FA383E)';
    const unviewedGradient = 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)';
    const defaultBorder = '#DADDE1';

    const ringBackground = isLive ? liveGradient : hasUnviewed ? unviewedGradient : defaultBorder;

    return (
        <div
            onClick={onClick}
            style={{
                width: size + 8,
                height: size + 8,
                borderRadius: '50%',
                background: ringBackground,
                padding: 3,
                cursor: 'pointer',
                // Pulsing animation for live users
                animation: isLive ? 'liveGlow 1.5s ease-in-out infinite' : 'none',
                boxShadow: isLive ? '0 0 15px rgba(250, 56, 62, 0.6)' : 'none',
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
function StoryAvatar({ story, onClick, isOwn, hasStory, onCreateStory, isLive }) {
    // Show ring if: other user has unviewed story, OR this is user's own story and they have stories
    const hasUnviewed = !story?.is_viewed && !isOwn;
    const showRing = hasUnviewed || (isOwn && hasStory);

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
            <StoryRing hasUnviewed={showRing} isLive={isLive} size={64}>
                <div style={{ position: 'relative' }}>
                    <img
                        src={story?.author_avatar || '/default-avatar.png'}
                        style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    {isLive && (
                        <div style={{
                            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                            background: '#FA383E', color: 'white',
                            padding: '2px 6px', borderRadius: 4,
                            fontSize: 10, fontWeight: 700,
                            border: '2px solid white',
                        }}>LIVE</div>
                    )}
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
                color: isLive ? '#FA383E' : C.text,
                fontWeight: isLive ? 700 : 400,
                textAlign: 'center',
                maxWidth: 70,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {isOwn ? 'Your Story' : (story?.author_username || 'User')}
            </span>
        </div>
    );
}

// Stories Bar - horizontal scroll of stories at top of feed
export function StoriesBar({ userId, userAvatar, onCreateStory }) {
    const [stories, setStories] = useState([]);
    const [liveUsers, setLiveUsers] = useState(new Set()); // Track who is live
    const [loading, setLoading] = useState(true);
    const [viewingStory, setViewingStory] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (userId) {
            loadStories();
            loadLiveUsers();
        }
    }, [userId]);

    const loadLiveUsers = async () => {
        const { data } = await supabase
            .from('live_streams')
            .select('broadcaster_id')
            .eq('status', 'live');
        if (data) {
            setLiveUsers(new Set(data.map(s => s.broadcaster_id)));
        }
    };

    const loadStories = async () => {
        console.log('[Stories] Loading stories for userId:', userId);
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('fn_get_stories', { p_viewer_id: userId });
            console.log('[Stories] RPC response:', { data: data?.length || 0, error });
            if (error) {
                console.error('[Stories] RPC error:', error);
            }
            if (data) {
                const grouped = {};
                data.forEach(story => {
                    if (!grouped[story.author_id]) {
                        grouped[story.author_id] = { ...story, stories: [story] };
                    } else {
                        grouped[story.author_id].stories.push(story);
                    }
                });
                console.log('[Stories] Grouped stories:', Object.keys(grouped).length);
                setStories(Object.values(grouped));
            }
        } catch (e) {
            console.error('Error loading stories:', e);
        }
        setLoading(false);
    };

    const handleViewStory = async (storyGroup) => {
        setViewingStory(storyGroup);
        if (!storyGroup.is_own) {
            await supabase.rpc('fn_view_story', {
                p_story_id: storyGroup.id,
                p_viewer_id: userId,
            });
        }
    };

    const ownStory = stories.find(s => s.is_own);
    const otherStories = stories.filter(s => !s.is_own);

    // For "Your Story" - use story media if exists, otherwise use user's profile avatar
    const yourStoryAvatar = ownStory?.author_avatar || userAvatar || '/default-avatar.png';

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
                    }}
                >
                    <StoryAvatar
                        story={{ author_avatar: yourStoryAvatar }}
                        isOwn={true}
                        hasStory={!!ownStory}
                        onClick={() => ownStory ? handleViewStory(ownStory) : setShowCreate(true)}
                        onCreateStory={() => setShowCreate(true)}
                    />

                    {otherStories.map(storyGroup => (
                        <StoryAvatar
                            key={storyGroup.author_id}
                            story={storyGroup}
                            onClick={() => handleViewStory(storyGroup)}
                            isLive={liveUsers.has(storyGroup.author_id)}
                        />
                    ))}

                    {loading && !stories.length && (
                        <div style={{ padding: '20px 40px', color: C.textSec }}>Loading stories...</div>
                    )}
                </div>
            </div>

            {viewingStory && (
                <StoryViewer
                    storyGroup={viewingStory}
                    onClose={() => { setViewingStory(null); loadStories(); }}
                    userId={userId}
                />
            )}

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

    useEffect(() => {
        setProgress(0);
        const duration = 5000;
        const interval = 50;
        let elapsed = 0;

        timerRef.current = setInterval(() => {
            elapsed += interval;
            setProgress((elapsed / duration) * 100);

            if (elapsed >= duration) {
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
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 20, right: 20,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none', color: 'white', fontSize: 24,
                    cursor: 'pointer', zIndex: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >✕</button>

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

                {/* Text overlay */}
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

                {/* Navigation */}
                <div onClick={goPrev} style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: '30%',
                    cursor: 'pointer',
                }} />
                <div onClick={goNext} style={{
                    position: 'absolute', top: 0, right: 0, bottom: 0, width: '70%',
                    cursor: 'pointer',
                }} />

                {/* View count */}
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

function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

// 🎬 CREATE STORY MODAL - Full-screen TikTok/Instagram style
function CreateStoryModal({ userId, onClose, onCreated }) {
    const [mode, setMode] = useState('select'); // 'select', 'text', 'media', 'preview'
    const [text, setText] = useState('');
    const [selectedGradient, setSelectedGradient] = useState(0);
    const [mediaUrl, setMediaUrl] = useState(null);
    const [mediaType, setMediaType] = useState('image');
    const [mediaPreview, setMediaPreview] = useState(null); // Local preview URL
    const [uploading, setUploading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    // Handle file selection with IMMEDIATE preview
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);

        // Create immediate local preview
        const localPreviewUrl = URL.createObjectURL(file);
        setMediaPreview(localPreviewUrl);
        setMode('preview');

        const isVideo = file.type.startsWith('video/');
        setMediaType(isVideo ? 'video' : 'image');

        // Upload in background
        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const filePath = `stories/${userId}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('stories')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                setError(`Upload failed: ${uploadError.message}`);
                setUploading(false);
                return;
            }

            const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(filePath);
            setMediaUrl(publicUrl);
            console.log('✅ Uploaded to:', publicUrl);
        } catch (err) {
            console.error('Upload error:', err);
            setError(`Upload failed: ${err.message}`);
        }
        setUploading(false);
    };

    const handleCreate = async () => {
        console.log('[Stories] handleCreate called');
        console.log('[Stories] userId:', userId);
        console.log('[Stories] text:', text);
        console.log('[Stories] mediaUrl:', mediaUrl);
        console.log('[Stories] mode:', mode);

        // Validate based on mode
        if (mode === 'select') {
            setError('Please choose Text or Photo/Video first');
            return;
        }

        if (mode === 'preview' && !mediaUrl) {
            if (uploading) {
                setError('Still uploading... please wait');
            } else {
                setError('Please select a photo or video');
            }
            return;
        }

        // For text mode, we can post even without text (gradient-only story is valid)
        // But we need SOMETHING for media mode
        if (mode !== 'text' && !text && !mediaUrl) {
            setError('Nothing to post');
            console.log('[Stories] No content to post, returning');
            return;
        }

        if (!userId) {
            setError('You must be logged in to post a story');
            console.log('[Stories] No userId!');
            return;
        }

        setCreating(true);
        setError(null);

        try {
            console.log('[Stories] Calling fn_create_story...');
            const { data: storyId, error: createError } = await supabase.rpc('fn_create_story', {
                p_user_id: userId,
                p_content: text || null,
                p_media_url: mediaUrl || null,
                p_media_type: mediaUrl ? mediaType : null,
                p_background_color: mode === 'text' ? STORY_GRADIENTS[selectedGradient] : null,
                p_link_url: null,
            });

            if (createError) {
                console.log('[Stories] Create error:', createError);
                throw createError;
            }

            console.log('[Stories] ✅ Story created! ID:', storyId);

            // Auto-save videos to Reels
            if (mediaType === 'video' && mediaUrl) {
                await supabase.from('social_reels').insert({
                    author_id: userId,
                    video_url: mediaUrl,
                    caption: text || null,
                    source_story_id: storyId,
                });
            }

            // Cleanup local preview
            if (mediaPreview) URL.revokeObjectURL(mediaPreview);

            onCreated();
        } catch (e) {
            console.error('Create story error:', e);
            setError(`Failed to create story: ${e.message}`);
        }
        setCreating(false);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mediaPreview) URL.revokeObjectURL(mediaPreview);
        };
    }, []);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: '#000',
                zIndex: 10000,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: 500,
                    margin: '0 auto',
                    width: '100%',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.5)',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            fontSize: 20,
                            cursor: 'pointer',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >✕</button>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'white' }}>Create Story</h3>
                    <button
                        onClick={handleCreate}
                        disabled={mode === 'select' || creating || uploading}
                        style={{
                            background: mode !== 'select' && !creating && !uploading ? C.blue : 'rgba(255,255,255,0.2)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 20,
                            padding: '10px 20px',
                            fontWeight: 600,
                            cursor: mode !== 'select' && !creating && !uploading ? 'pointer' : 'not-allowed',
                            opacity: mode !== 'select' && !creating && !uploading ? 1 : 0.5,
                        }}
                    >
                        {creating ? 'Posting...' : uploading ? 'Uploading...' : mode === 'select' ? 'Choose Content' : 'Share'}
                    </button>
                </div>

                {/* Error message */}
                {error && (
                    <div style={{
                        background: '#ff4444',
                        color: 'white',
                        padding: '10px 20px',
                        textAlign: 'center',
                        fontSize: 14,
                    }}>
                        {error}
                    </div>
                )}

                {/* Content Area */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                }}>
                    {/* Selection Mode */}
                    {mode === 'select' && (
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 24,
                            padding: 40,
                        }}>
                            <h2 style={{ color: 'white', fontSize: 24, fontWeight: 700, margin: 0 }}>
                                What do you want to share?
                            </h2>

                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        width: 140,
                                        height: 140,
                                        borderRadius: 16,
                                        background: 'linear-gradient(135deg, #833AB4, #FD1D1D)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        boxShadow: '0 4px 20px rgba(131, 58, 180, 0.4)',
                                    }}
                                >
                                    <span style={{ fontSize: 48 }}>📷</span>
                                    <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>Photo/Video</span>
                                </button>

                                <button
                                    onClick={() => setMode('text')}
                                    style={{
                                        width: 140,
                                        height: 140,
                                        borderRadius: 16,
                                        background: 'linear-gradient(135deg, #1877F2, #00D4FF)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        boxShadow: '0 4px 20px rgba(24, 119, 242, 0.4)',
                                    }}
                                >
                                    <span style={{ fontSize: 48 }}>Aa</span>
                                    <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>Text Story</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Text Mode */}
                    {mode === 'text' && (
                        <div style={{
                            flex: 1,
                            background: STORY_GRADIENTS[selectedGradient],
                            display: 'flex',
                            flexDirection: 'column',
                        }}>
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 40,
                            }}>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Start typing..."
                                    autoFocus
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'white',
                                        fontSize: 28,
                                        fontWeight: 700,
                                        textAlign: 'center',
                                        width: '100%',
                                        resize: 'none',
                                        outline: 'none',
                                        textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                    }}
                                    rows={5}
                                />
                            </div>

                            {/* Background selector */}
                            <div style={{
                                padding: 16,
                                background: 'rgba(0,0,0,0.3)',
                            }}>
                                <p style={{ color: 'white', fontSize: 12, marginBottom: 8, opacity: 0.7 }}>Background</p>
                                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                                    {STORY_GRADIENTS.map((grad, i) => (
                                        <div
                                            key={i}
                                            onClick={() => setSelectedGradient(i)}
                                            style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 8,
                                                background: grad,
                                                cursor: 'pointer',
                                                border: selectedGradient === i ? '3px solid white' : '2px solid rgba(255,255,255,0.3)',
                                                flexShrink: 0,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Preview Mode (after selecting photo/video) */}
                    {mode === 'preview' && (
                        <div style={{
                            flex: 1,
                            background: '#000',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                        }}>
                            {/* Media preview */}
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                            }}>
                                {mediaPreview && (
                                    mediaType === 'video' ? (
                                        <video
                                            src={mediaPreview}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                            controls
                                            autoPlay
                                            muted
                                        />
                                    ) : (
                                        <img
                                            src={mediaPreview}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                            alt="Preview"
                                        />
                                    )
                                )}

                                {/* Upload indicator overlay */}
                                {uploading && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        background: 'rgba(0,0,0,0.5)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <div style={{
                                            background: 'rgba(0,0,0,0.8)',
                                            padding: '20px 40px',
                                            borderRadius: 12,
                                            color: 'white',
                                            fontSize: 16,
                                            fontWeight: 600,
                                        }}>
                                            📤 Uploading...
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Caption input */}
                            <div style={{
                                padding: 16,
                                background: 'rgba(0,0,0,0.5)',
                            }}>
                                <input
                                    type="text"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Add a caption..."
                                    style={{
                                        width: '100%',
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        padding: '12px 16px',
                                        borderRadius: 24,
                                        color: 'white',
                                        fontSize: 16,
                                        outline: 'none',
                                    }}
                                />
                            </div>

                            {/* Change photo button */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    position: 'absolute',
                                    bottom: 80,
                                    right: 16,
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: 20,
                                    color: 'white',
                                    fontSize: 14,
                                    cursor: 'pointer',
                                }}
                            >
                                📷 Change
                            </button>
                        </div>
                    )}
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    hidden
                    onChange={handleFileSelect}
                />
            </div>
        </div>
    );
}

// Share to Story prompt
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
    };

    return (
        <div style={{
            padding: 16,
            background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
            borderRadius: 12,
            marginBottom: 16,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>Add to your Story?</div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Share this with your followers</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none', borderRadius: 20, padding: '8px 16px',
                        color: 'white', fontWeight: 500, cursor: 'pointer',
                    }}>Not now</button>
                    <button onClick={handleShare} disabled={sharing} style={{
                        background: 'white',
                        border: 'none', borderRadius: 20, padding: '8px 20px',
                        color: '#833AB4', fontWeight: 600, cursor: 'pointer',
                    }}>{sharing ? '...' : 'Share'}</button>
                </div>
            </div>
        </div>
    );
}

export default StoriesBar;
