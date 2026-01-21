/**
 * 📸 MEDIA LIBRARY COMPONENT
 * Premium Facebook-style photo/video gallery with lightbox
 * src/components/social/MediaLibrary.js
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const C = {
    bg: '#0a0a0f',
    surface: 'rgba(255, 255, 255, 0.03)',
    surfaceHover: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#ffffff',
    textMuted: 'rgba(255, 255, 255, 0.6)',
    accent: '#00d4ff',
    accentGlow: 'rgba(0, 212, 255, 0.3)',
    gold: '#ffd700',
    danger: '#ff4757',
};

const styles = {
    // Modal Overlay
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out',
    },

    // Main Container
    container: {
        background: C.bg,
        borderRadius: 16,
        width: '95vw',
        maxWidth: 1200,
        height: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: `1px solid ${C.border}`,
        boxShadow: '0 32px 64px rgba(0, 0, 0, 0.5)',
    },

    // Header
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: `1px solid ${C.border}`,
        background: 'rgba(255, 255, 255, 0.02)',
    },

    title: {
        fontSize: 20,
        fontWeight: 700,
        color: C.text,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },

    closeBtn: {
        background: 'transparent',
        border: 'none',
        color: C.textMuted,
        fontSize: 28,
        cursor: 'pointer',
        padding: 8,
        borderRadius: 8,
        transition: 'all 0.2s',
    },

    // Tabs
    tabs: {
        display: 'flex',
        gap: 4,
        padding: '12px 24px',
        borderBottom: `1px solid ${C.border}`,
        background: 'rgba(255, 255, 255, 0.01)',
    },

    tab: (active) => ({
        padding: '10px 20px',
        borderRadius: 8,
        border: 'none',
        background: active ? C.accent : 'transparent',
        color: active ? '#000' : C.textMuted,
        fontWeight: 600,
        fontSize: 14,
        cursor: 'pointer',
        transition: 'all 0.2s',
    }),

    // Upload Area
    uploadArea: (isDragging) => ({
        margin: '16px 24px 0',
        padding: 24,
        borderRadius: 12,
        border: `2px dashed ${isDragging ? C.accent : C.border}`,
        background: isDragging ? C.accentGlow : C.surface,
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
    }),

    uploadIcon: {
        fontSize: 48,
        marginBottom: 12,
    },

    uploadText: {
        color: C.textMuted,
        fontSize: 14,
    },

    // Grid
    grid: {
        flex: 1,
        overflow: 'auto',
        padding: 24,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 12,
        alignContent: 'start',
    },

    // Media Item
    mediaItem: {
        position: 'relative',
        aspectRatio: '1',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        background: C.surface,
        transition: 'transform 0.2s, box-shadow 0.2s',
    },

    mediaImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },

    videoBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
    },

    profileBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        background: C.accent,
        color: '#000',
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
    },

    // Lightbox
    lightbox: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    lightboxImage: {
        maxWidth: '90vw',
        maxHeight: '85vh',
        objectFit: 'contain',
        borderRadius: 8,
    },

    lightboxNav: (side) => ({
        position: 'fixed',
        [side]: 20,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(255, 255, 255, 0.1)',
        border: 'none',
        color: '#fff',
        width: 50,
        height: 50,
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
    }),

    lightboxActions: {
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 12,
        background: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        borderRadius: 12,
    },

    actionBtn: (primary) => ({
        padding: '10px 20px',
        borderRadius: 8,
        border: 'none',
        background: primary ? C.accent : C.surface,
        color: primary ? '#000' : C.text,
        fontWeight: 600,
        fontSize: 14,
        cursor: 'pointer',
        transition: 'all 0.2s',
    }),

    // Empty State
    emptyState: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.textMuted,
    },

    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
        opacity: 0.5,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// 📸 MEDIA LIBRARY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function MediaLibrary({
    isOpen,
    onClose,
    userId,
    supabase,
    onSelectMedia,
    mode = 'browse' // 'browse' | 'select' | 'profile'
}) {
    const [activeTab, setActiveTab] = useState('all');
    const [media, setMedia] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [lightboxMedia, setLightboxMedia] = useState(null);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const fileInputRef = useRef(null);

    // Fetch user's media
    const fetchMedia = useCallback(async () => {
        if (!userId || !supabase) return;

        setLoading(true);
        try {
            let query = supabase
                .from('user_media')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            // Filter by tab
            if (activeTab === 'photos') {
                query = query.eq('media_type', 'photo');
            } else if (activeTab === 'videos') {
                query = query.eq('media_type', 'video');
            } else if (activeTab === 'profile') {
                query = query.eq('is_profile_picture', true);
            }

            const { data, error } = await query;

            if (error) throw error;
            setMedia(data || []);
        } catch (err) {
            console.error('Error fetching media:', err);
        } finally {
            setLoading(false);
        }
    }, [userId, supabase, activeTab]);

    useEffect(() => {
        if (isOpen) {
            fetchMedia();
        }
    }, [isOpen, fetchMedia]);

    // Handle file upload
    const handleUpload = async (files) => {
        if (!files.length || !userId || !supabase) return;

        setUploading(true);
        try {
            for (const file of files) {
                const isVideo = file.type.startsWith('video/');
                const mediaType = isVideo ? 'video' : 'photo';
                const fileExt = file.name.split('.').pop();
                const mediaId = crypto.randomUUID();
                const storagePath = `${userId}/${mediaType}s/${mediaId}.${fileExt}`;

                // Upload to storage
                const { error: uploadError } = await supabase.storage
                    .from('user-media')
                    .upload(storagePath, file);

                if (uploadError) throw uploadError;

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('user-media')
                    .getPublicUrl(storagePath);

                // Insert into database
                const { error: dbError } = await supabase
                    .from('user_media')
                    .insert({
                        id: mediaId,
                        user_id: userId,
                        media_type: mediaType,
                        storage_path: storagePath,
                        public_url: urlData.publicUrl,
                        filename: file.name,
                        file_size: file.size,
                        mime_type: file.type,
                    });

                if (dbError) throw dbError;
            }

            // Refresh
            fetchMedia();
        } catch (err) {
            console.error('Upload error:', err);
        } finally {
            setUploading(false);
        }
    };

    // Handle file input change
    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        handleUpload(files);
    };

    // Handle drag and drop
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        handleUpload(files);
    };

    // Set as profile picture
    const handleSetAsProfile = async (mediaItem) => {
        try {
            const { error } = await supabase.rpc('set_profile_picture', {
                p_media_id: mediaItem.id
            });

            if (error) throw error;

            fetchMedia();
            setLightboxMedia(null);
        } catch (err) {
            console.error('Error setting profile picture:', err);
        }
    };

    // Delete media
    const handleDelete = async (mediaItem) => {
        if (!confirm('Delete this media?')) return;

        try {
            // Delete from storage
            await supabase.storage
                .from('user-media')
                .remove([mediaItem.storage_path]);

            // Delete from database
            await supabase
                .from('user_media')
                .delete()
                .eq('id', mediaItem.id);

            fetchMedia();
            setLightboxMedia(null);
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    // Lightbox navigation
    const handleLightboxNav = (direction) => {
        const newIndex = lightboxIndex + direction;
        if (newIndex >= 0 && newIndex < media.length) {
            setLightboxIndex(newIndex);
            setLightboxMedia(media[newIndex]);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Main Modal */}
            <div style={styles.overlay} onClick={onClose}>
                <div style={styles.container} onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div style={styles.header}>
                        <div style={styles.title}>
                            📸 {mode === 'profile' ? 'Choose Profile Picture' : 'Media Library'}
                        </div>
                        <button style={styles.closeBtn} onClick={onClose}>×</button>
                    </div>

                    {/* Tabs */}
                    <div style={styles.tabs}>
                        {['all', 'photos', 'videos', 'profile'].map((tab) => (
                            <button
                                key={tab}
                                style={styles.tab(activeTab === tab)}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab === 'all' && '📁 All'}
                                {tab === 'photos' && '📷 Photos'}
                                {tab === 'videos' && '🎬 Videos'}
                                {tab === 'profile' && '👤 Profile Pics'}
                            </button>
                        ))}
                    </div>

                    {/* Upload Area */}
                    <div
                        style={styles.uploadArea(isDragging)}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                    >
                        <div style={styles.uploadIcon}>
                            {uploading ? '⏳' : '📤'}
                        </div>
                        <div style={styles.uploadText}>
                            {uploading
                                ? 'Uploading...'
                                : 'Drag & drop files or click to upload'}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    </div>

                    {/* Media Grid */}
                    {loading ? (
                        <div style={styles.emptyState}>
                            <div style={{ fontSize: 32 }}>⏳</div>
                            <div>Loading...</div>
                        </div>
                    ) : media.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>📷</div>
                            <div>No media yet</div>
                            <div style={{ fontSize: 14, marginTop: 8 }}>
                                Upload photos and videos to build your library
                            </div>
                        </div>
                    ) : (
                        <div style={styles.grid}>
                            {media.map((item, index) => (
                                <div
                                    key={item.id}
                                    style={styles.mediaItem}
                                    onClick={() => {
                                        if (mode === 'select' && onSelectMedia) {
                                            onSelectMedia(item);
                                            onClose();
                                        } else {
                                            setLightboxMedia(item);
                                            setLightboxIndex(index);
                                        }
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.03)';
                                        e.currentTarget.style.boxShadow = `0 8px 24px ${C.accentGlow}`;
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    {item.media_type === 'video' ? (
                                        <>
                                            <video
                                                src={item.public_url}
                                                style={styles.mediaImage}
                                                muted
                                            />
                                            <div style={styles.videoBadge}>▶ Video</div>
                                        </>
                                    ) : (
                                        <img
                                            src={item.thumbnail_url || item.public_url}
                                            alt=""
                                            style={styles.mediaImage}
                                        />
                                    )}

                                    {item.is_current_profile_picture && (
                                        <div style={styles.profileBadge}>Current</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            {lightboxMedia && (
                <div style={styles.lightbox} onClick={() => setLightboxMedia(null)}>
                    {lightboxMedia.media_type === 'video' ? (
                        <video
                            src={lightboxMedia.public_url}
                            style={styles.lightboxImage}
                            controls
                            autoPlay
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <img
                            src={lightboxMedia.public_url}
                            alt=""
                            style={styles.lightboxImage}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}

                    {/* Navigation */}
                    {lightboxIndex > 0 && (
                        <button
                            style={styles.lightboxNav('left')}
                            onClick={(e) => { e.stopPropagation(); handleLightboxNav(-1); }}
                        >
                            ←
                        </button>
                    )}
                    {lightboxIndex < media.length - 1 && (
                        <button
                            style={styles.lightboxNav('right')}
                            onClick={(e) => { e.stopPropagation(); handleLightboxNav(1); }}
                        >
                            →
                        </button>
                    )}

                    {/* Actions */}
                    <div style={styles.lightboxActions} onClick={(e) => e.stopPropagation()}>
                        {lightboxMedia.media_type === 'photo' && !lightboxMedia.is_current_profile_picture && (
                            <button
                                style={styles.actionBtn(true)}
                                onClick={() => handleSetAsProfile(lightboxMedia)}
                            >
                                👤 Set as Profile Picture
                            </button>
                        )}
                        <button
                            style={styles.actionBtn(false)}
                            onClick={() => handleDelete(lightboxMedia)}
                        >
                            🗑️ Delete
                        </button>
                        <button
                            style={styles.actionBtn(false)}
                            onClick={() => setLightboxMedia(null)}
                        >
                            ✕ Close
                        </button>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
}

export default MediaLibrary;
