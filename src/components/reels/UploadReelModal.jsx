/**
 * Upload Reel Modal Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Modal for uploading video reels to Supabase storage
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function UploadReelModal({ user, onClose, onSuccess }) {
    const [uploading, setUploading] = useState(false);
    const [caption, setCaption] = useState('');
    const [videoFile, setVideoFile] = useState(null);
    const [error, setError] = useState('');

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('video/')) {
            setError('Please select a video file');
            return;
        }

        // Validate file size (max 100MB)
        if (file.size > 100 * 1024 * 1024) {
            setError('Video must be less than 100MB');
            return;
        }

        setVideoFile(file);
        setError('');
    };

    const handleUpload = async () => {
        if (!videoFile || !user) return;

        setUploading(true);
        setError('');

        try {
            // Upload video to Supabase storage
            const fileExt = videoFile.name.split('.').pop();
            const fileName = `${user.id}/${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('reels')
                .upload(fileName, videoFile, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('reels')
                .getPublicUrl(fileName);

            // Create social_reels entry
            const { error: insertError } = await supabase
                .from('social_reels')
                .insert({
                    user_id: user.id,
                    video_url: publicUrl,
                    caption: caption || null,
                    likes_count: 0,
                    comments_count: 0,
                    shares_count: 0
                });

            if (insertError) throw insertError;

            // Also create a social_posts entry for feed integration
            await supabase
                .from('social_posts')
                .insert({
                    author_id: user.id,
                    content: caption || '',
                    content_type: 'video',
                    media_urls: [publicUrl],
                    visibility: 'public',
                    like_count: 0,
                    comment_count: 0
                });

            onSuccess();
        } catch (err) {
            console.error('Upload error:', err);
            setError(err.message || 'Failed to upload reel');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.header}>
                    <h2 style={styles.title}>Upload Reel</h2>
                    <button onClick={onClose} style={styles.closeButton}>✕</button>
                </div>

                <div style={styles.content}>
                    {/* File Input */}
                    <div style={styles.fileInputContainer}>
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleFileSelect}
                            style={styles.fileInput}
                            id="video-upload"
                        />
                        <label htmlFor="video-upload" style={styles.fileLabel}>
                            {videoFile ? videoFile.name : '📹 Choose Video'}
                        </label>
                    </div>

                    {/* Caption Input */}
                    <textarea
                        placeholder="Add a caption..."
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        style={styles.textarea}
                        maxLength={500}
                    />

                    {/* Error Message */}
                    {error && <div style={styles.error}>{error}</div>}

                    {/* Upload Button */}
                    <button
                        onClick={handleUpload}
                        disabled={!videoFile || uploading}
                        style={{
                            ...styles.uploadButton,
                            opacity: !videoFile || uploading ? 0.5 : 1,
                            cursor: !videoFile || uploading ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {uploading ? 'Uploading...' : 'Upload Reel'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
    },
    modal: {
        background: '#1a1a1a',
        borderRadius: '16px',
        width: '90%',
        maxWidth: '500px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
    },
    title: {
        fontSize: '20px',
        fontWeight: 700,
        color: '#fff',
        margin: 0
    },
    closeButton: {
        background: 'transparent',
        border: 'none',
        color: '#fff',
        fontSize: '24px',
        cursor: 'pointer',
        padding: 0,
        width: '32px',
        height: '32px'
    },
    content: {
        padding: '24px'
    },
    fileInputContainer: {
        marginBottom: '16px'
    },
    fileInput: {
        display: 'none'
    },
    fileLabel: {
        display: 'block',
        padding: '16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '2px dashed rgba(0, 212, 255, 0.3)',
        borderRadius: '12px',
        color: '#00D4FF',
        textAlign: 'center',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 600,
        transition: 'all 0.2s'
    },
    textarea: {
        width: '100%',
        minHeight: '100px',
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontFamily: 'inherit',
        resize: 'vertical',
        marginBottom: '16px'
    },
    error: {
        padding: '12px',
        background: 'rgba(255, 68, 68, 0.1)',
        border: '1px solid rgba(255, 68, 68, 0.3)',
        borderRadius: '8px',
        color: '#FF4444',
        fontSize: '14px',
        marginBottom: '16px'
    },
    uploadButton: {
        width: '100%',
        padding: '14px',
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s'
    }
};
