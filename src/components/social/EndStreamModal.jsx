/* ═══════════════════════════════════════════════════════════════════════════
   END STREAM MODAL — Post Now, Save to Lives, or Delete after streaming
   Shows after user ends live broadcast with video preview and options
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const C = {
    bg: '#F0F2F5',
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
    blue: '#1877F2',
    red: '#FA383E',
    green: '#42B72A',
};

export function EndStreamModal({
    isOpen,
    onClose,
    streamId,
    videoBlob,
    thumbnailUrl,
    duration,
    user
}) {
    const [caption, setCaption] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState('');
    const videoRef = useRef(null);

    // Set video source when blob is available
    useEffect(() => {
        if (videoBlob && videoRef.current) {
            videoRef.current.src = URL.createObjectURL(videoBlob);
        }
    }, [videoBlob]);

    const formatDuration = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const uploadVideo = async () => {
        if (!videoBlob || !user?.id || !streamId) return null;

        const filename = `${user.id}/${streamId}.webm`;

        const { data, error } = await supabase.storage
            .from('live-recordings')
            .upload(filename, videoBlob, {
                contentType: 'video/webm',
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('live-recordings')
            .getPublicUrl(filename);

        return urlData.publicUrl;
    };

    const handlePostNow = async () => {
        setIsUploading(true);
        setError('');
        setUploadProgress(10);

        try {
            // Upload video
            setUploadProgress(30);
            const videoUrl = await uploadVideo();
            setUploadProgress(60);

            // Update stream record with video URL
            await supabase
                .from('live_streams')
                .update({
                    video_url: videoUrl,
                    thumbnail_url: thumbnailUrl,
                    is_posted: true,
                    is_draft: false
                })
                .eq('id', streamId);

            setUploadProgress(80);

            // Create social post
            await supabase.from('social_posts').insert({
                author_id: user.id,
                content: caption || '🔴 Live replay',
                content_type: 'video',
                media_urls: [videoUrl],
                visibility: 'public'
            });

            setUploadProgress(100);
            onClose('posted');
        } catch (err) {
            console.error('Post error:', err);
            setError(err.message || 'Failed to post stream');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveToLives = async () => {
        setIsUploading(true);
        setError('');
        setUploadProgress(10);

        try {
            // Upload video
            setUploadProgress(30);
            const videoUrl = await uploadVideo();
            setUploadProgress(80);

            // Update stream record - save as draft
            await supabase
                .from('live_streams')
                .update({
                    video_url: videoUrl,
                    thumbnail_url: thumbnailUrl,
                    is_posted: false,
                    is_draft: true
                })
                .eq('id', streamId);

            setUploadProgress(100);
            onClose('saved');
        } catch (err) {
            console.error('Save error:', err);
            setError(err.message || 'Failed to save stream');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Delete this recording? This cannot be undone.')) return;

        try {
            // Delete stream record
            await supabase
                .from('live_streams')
                .delete()
                .eq('id', streamId);

            onClose('deleted');
        } catch (err) {
            console.error('Delete error:', err);
            setError(err.message || 'Failed to delete');
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    background: C.card,
                    borderRadius: 12,
                    width: 'min(500px, 90vw)',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: `1px solid ${C.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>
                        🎬 Stream Ended
                    </h2>
                    <div style={{ color: C.textSec, fontSize: 14 }}>
                        Duration: {formatDuration(duration || 0)}
                    </div>
                </div>

                {/* Video Preview */}
                <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
                    {videoBlob ? (
                        <video
                            ref={videoRef}
                            controls
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    ) : thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt="Stream preview"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    ) : (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'white',
                            opacity: 0.5
                        }}>
                            No preview available
                        </div>
                    )}
                </div>

                {/* Caption Input */}
                <div style={{ padding: 16 }}>
                    <input
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Add a caption... (optional)"
                        disabled={isUploading}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            fontSize: 15,
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Progress Bar */}
                {isUploading && (
                    <div style={{ padding: '0 16px 16px' }}>
                        <div style={{
                            height: 6,
                            background: C.border,
                            borderRadius: 3,
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${uploadProgress}%`,
                                background: C.blue,
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                        <div style={{
                            textAlign: 'center',
                            fontSize: 13,
                            color: C.textSec,
                            marginTop: 8
                        }}>
                            Uploading... {uploadProgress}%
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div style={{ padding: '0 16px 16px', color: C.red, fontSize: 14 }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{
                    padding: 16,
                    borderTop: `1px solid ${C.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                }}>
                    {/* Post Now - Primary */}
                    <button
                        onClick={handlePostNow}
                        disabled={isUploading}
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            borderRadius: 8,
                            border: 'none',
                            background: C.blue,
                            color: 'white',
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: isUploading ? 'not-allowed' : 'pointer',
                            opacity: isUploading ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                        }}
                    >
                        📤 Post Now
                    </button>

                    {/* Save to Lives - Secondary */}
                    <button
                        onClick={handleSaveToLives}
                        disabled={isUploading}
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            background: 'white',
                            color: C.text,
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: isUploading ? 'not-allowed' : 'pointer',
                            opacity: isUploading ? 0.6 : 1,
                        }}
                    >
                        💾 Save to Lives
                    </button>

                    {/* Delete - Destructive */}
                    <button
                        onClick={handleDelete}
                        disabled={isUploading}
                        style={{
                            width: '100%',
                            padding: '12px 24px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'transparent',
                            color: C.red,
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: isUploading ? 'not-allowed' : 'pointer',
                            opacity: isUploading ? 0.6 : 1,
                        }}
                    >
                        🗑️ Delete Recording
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EndStreamModal;
