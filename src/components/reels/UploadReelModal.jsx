/**
 * Upload Reel Modal Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Modal for uploading video reels to Supabase storage
 * Uses direct-to-Supabase signed URL uploads — NO file size limit
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function UploadReelModal({ user, onClose, onSuccess }) {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [caption, setCaption] = useState('');
    const [videoFile, setVideoFile] = useState(null);
    const [error, setError] = useState('');

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type || !file.type.startsWith('video/')) {
            setError('Please select a valid video file');
            return;
        }

        // No file size limit — direct-to-Supabase handles any size
        setVideoFile(file);
        setError('');
    };

    const handleUpload = async () => {
        if (!videoFile || !user) return;

        setUploading(true);
        setUploadProgress(0);
        setError('');

        try {
            // 1. Get signed upload URL from our API (metadata only, no file body)
            const { data: { session: _reelSess } } = await supabase.auth.getSession();
            const metaRes = await fetch('/api/social/upload-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(_reelSess?.access_token ? { Authorization: `Bearer ${_reelSess.access_token}` } : {}),
                },
                body: JSON.stringify({
                    fileName: videoFile.name,
                    fileSize: videoFile.size,
                    mimeType: videoFile.type,
                    folder: 'reels',
                    prefix: user.id,
                }),
            });
            const meta = await metaRes.json();
            if (!meta.success) {
                throw new Error(meta.error || 'Failed to create upload URL');
            }

            setUploadProgress(5);

            // 2. Upload directly to Supabase Storage via signed URL (bypasses Vercel body limit)
            const xhr = new XMLHttpRequest();
            const publicUrl = await new Promise((resolve, reject) => {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const pct = e.total > 0 ? Math.round((e.loaded / e.total) * 85) + 5 : 5;
                        setUploadProgress(Math.min(pct, 90));
                    }
                });
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(meta.publicUrl);
                    } else {
                        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
                    }
                });
                xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
                xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
                xhr.open('PUT', meta.signedUrl);
                xhr.setRequestHeader('Content-Type', videoFile.type);
                xhr.send(videoFile);
            });

            setUploadProgress(92);

            // 3. Create social_reels entry
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

            setUploadProgress(96);

            // 4. Also create a social_posts entry for feed integration
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

            setUploadProgress(100);
            onSuccess();
        } catch (err) {
            console.error('Upload error:', err);
            setError(err.message || 'Failed to upload reel');
        } finally {
            setUploading(false);
        }
    };

    const fileSizeMB = videoFile ? (videoFile.size / (1024 * 1024)).toFixed(1) : 0;

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
                            {videoFile ? `📹 ${videoFile.name} (${fileSizeMB}MB)` : '📹 Choose Video'}
                        </label>
                    </div>

                    {/* Caption Input */}
                    <textarea
                        placeholder="Add A Caption..."
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        style={styles.textarea}
                        maxLength={500}
                    />

                    {/* Upload Progress Bar */}
                    {uploading && (
                        <div style={styles.progressContainer}>
                            <div style={{ ...styles.progressBar, width: `${uploadProgress}%` }} />
                            <span style={styles.progressLabel}>{uploadProgress}%</span>
                        </div>
                    )}

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
                        {uploading ? `Uploading… ${uploadProgress}%` : 'Upload Reel'}
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
    progressContainer: {
        position: 'relative',
        height: '24px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    progressBar: {
        height: '100%',
        background: 'linear-gradient(90deg, #00E0FF, #0099FF)',
        borderRadius: '12px',
        transition: 'width 0.3s ease'
    },
    progressLabel: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
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
