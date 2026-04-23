/**
 * Upload Reel Modal Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Modal for uploading video reels to Supabase storage
 * Uses direct-to-Supabase signed URL uploads — NO file size limit
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sniffMimeType, compressVideoIfNeeded, uploadVideoWithProgress } from '../../lib/socialHelpers';
import { getAccessToken } from '../../lib/authUtils';

export default function UploadReelModal({ user, onClose, onSuccess }) {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    // Phase label shown inside the progress bar ("Compressing… 42%", "Uploading… 67%", etc.)
    const [uploadLabel, setUploadLabel] = useState('');
    const [caption, setCaption] = useState('');
    const [videoFile, setVideoFile] = useState(null);
    const [error, setError] = useState('');

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Use sniffMimeType — iOS Photo Library may return empty or codec-suffixed file.type
        const mime = sniffMimeType(file);
        if (!mime.startsWith('video/')) {
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
        setError('');

        // ⚡ IMMEDIATE FEEDBACK — visible within 100ms, before any async work
        setUploadProgress(0);
        setUploadLabel('Preparing…');

        try {
            // ── Step 1: Compress video if large (>30 MB) ──────────────────────
            // Runs in real-time (1× playback speed) but produces 70-85% smaller
            // output, making the actual upload 3-5× faster on mobile cellular.
            setUploadLabel('Compressing video…');
            let uploadFile = videoFile;
            try {
                uploadFile = await compressVideoIfNeeded(videoFile, ({ pct, label }) => {
                    setUploadProgress(Math.round(pct * 0.45)); // 0-45% = compress phase
                    setUploadLabel(label);
                });
            } catch (compressErr) {
                console.warn('[UploadReel] Compression failed, uploading original:', compressErr);
                uploadFile = videoFile;
            }

            // ── Step 2: Get signed upload URL ─────────────────────────────────
            setUploadProgress(47);
            setUploadLabel('Preparing upload…');

            const cleanMime = sniffMimeType(uploadFile);
            const token = getAccessToken();
            if (!token) throw new Error('Authentication required — please refresh and try again.');

            const metaRes = await fetch('/api/social/upload-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    fileName: uploadFile.name,
                    fileSize: uploadFile.size,
                    mimeType: cleanMime,
                    folder: 'reels',
                    prefix: user.id,
                }),
            });
            const meta = await metaRes.json();
            if (!meta.success) {
                throw new Error(meta.error || 'Failed to create upload URL');
            }

            setUploadProgress(50);
            setUploadLabel('Uploading…');

            // ── Step 3: Upload directly to Supabase (maps 50→93%) ─────────────
            await uploadVideoWithProgress(meta.signedUrl, uploadFile, cleanMime, ({ pct }) => {
                setUploadProgress(50 + Math.round(pct * 0.43));
                setUploadLabel(`Uploading… ${pct}%`);
            });

            setUploadProgress(94);
            setUploadLabel('Saving reel…');

            // ── Step 4: Create social_reels entry ─────────────────────────────
            const { data: reelRow, error: insertError } = await supabase
                .from('social_reels')
                .insert({
                    author_id: user.id,
                    video_url: meta.publicUrl,
                    caption: caption.trim() || null,
                    like_count: 0,
                    comment_count: 0,
                    share_count: 0,
                    view_count: 0,
                    is_public: true,
                })
                .select('id')
                .maybeSingle();

            if (insertError) throw insertError;

            setUploadProgress(97);
            setUploadLabel('Syncing feed…');

            // ── Step 5: Create social_posts entry for feed (non-fatal) ─────────
            try {
                await supabase
                    .from('social_posts')
                    .insert({
                        author_id: user.id,
                        content: caption.trim() || '',
                        content_type: 'video',
                        media_urls: [meta.publicUrl],
                        visibility: 'public',
                        like_count: 0,
                        comment_count: 0,
                        share_count: 0,
                        link_url: reelRow?.id ? `/hub/reels?id=${reelRow.id}` : null,
                    });
            } catch (feedErr) {
                console.warn('[UploadReel] Feed post creation failed (non-fatal):', feedErr.message);
            }

            setUploadProgress(100);
            setUploadLabel('Done!');
            onSuccess();
        } catch (err) {
            console.warn('Upload error:', err);
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
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -12, marginBottom: 12 }}>
                        {caption.length}/500
                    </div>

                    {/* Upload Progress Bar */}
                    {uploading && (
                        <div style={styles.progressContainer}>
                            <div style={{ ...styles.progressBar, width: `${uploadProgress}%` }} />
                            <span style={styles.progressLabel}>
                                {uploadLabel || `${uploadProgress}%`}
                            </span>
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
                        {uploading ? (uploadLabel || `${uploadProgress}%`) : 'Upload Reel'}
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
