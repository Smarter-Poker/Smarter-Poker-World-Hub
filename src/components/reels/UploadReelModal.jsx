/**
 * Upload Reel Modal Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Modal for uploading video reels to Supabase storage
 * Uses direct-to-Supabase signed URL uploads — NO file size limit
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { sniffMimeType } from '../../lib/socialHelpers';
import bgUpload from '../../lib/backgroundVideoUpload';
import toast from '../../stores/toastStore';



export default function UploadReelModal({ user, onClose, onSuccess }) {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    // Phase label shown inside the progress bar ("Preparing upload…", "Uploading… 67%", etc.)
    const [uploadLabel, setUploadLabel] = useState('');
    const [caption, setCaption] = useState('');
    const [videoFile, setVideoFile] = useState(null);
    const [error, setError] = useState('');

    // Mounted guard — prevents state updates after modal is unmounted by background mode
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // NOTE: Do NOT unsubscribe bgUpload here. The listener must stay alive
            // so onComplete fires and triggers the DB insert (social_reels + social_posts).
            // Cleanup happens via bgUpload.abort() when a new upload starts.
        };
    }, []);

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

        // 🚀 PREFETCH: Start fetching the upload URL now while user types caption.
        // By the time they hit "Upload", the URL is already cached → 0ms latency.
        if (user?.id) {
            bgUpload.prefetch({ file, userId: user.id, folder: 'reels' });
        }
    };

    const handleUpload = async () => {
        if (!videoFile || !user) return;

        setUploading(true);
        setError('');

        // ⚡ IMMEDIATE FEEDBACK — visible within 100ms, before any async work
        setUploadProgress(2);
        setUploadLabel('Preparing…');

        try {
            // bgUpload: signed URL + XHR with 10-second background rule.
            // wasBackground = true if modal was auto-dismissed before upload finished.
            let bgUnsub = null;
            let wasBackground = false;

            const publicUrl = await new Promise((resolve, reject) => {
                bgUnsub = bgUpload.subscribe({
                    onProgress: ({ pct, label }) => {
                        if (!mountedRef.current) return; // Guard: modal may be unmounted
                        setUploadProgress(pct);
                        setUploadLabel(label);
                    },
                    onComplete: ({ publicUrl, wasBackground: bg }) => {
                        wasBackground = bg;
                        resolve(publicUrl);
                    },
                    onError: ({ error }) => reject(error),
                    onBackground: () => {
                        // Upload taking >10s — close modal so user can browse freely.
                        // bgUpload shows the persistent "uploading in background" info toast.
                        onClose?.();
                    },
                });

                bgUpload.start({
                    file: videoFile,
                    userId: user.id,
                    folder: 'reels',
                }).catch(reject);
            });
            if (bgUnsub) bgUnsub();

            if (!wasBackground) {
                setUploadProgress(94);
                setUploadLabel('Saving reel…');
            }

            // Create social_reels entry
            const { data: reelRow, error: insertError } = await supabase
                .from('social_reels')
                .insert({
                    author_id: user.id,
                    video_url: publicUrl,
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

            if (!wasBackground) {
                setUploadProgress(97);
                setUploadLabel('Syncing feed…');
            }

            // Create social_posts entry for feed (non-fatal)
            try {
                await supabase
                    .from('social_posts')
                    .insert({
                        author_id: user.id,
                        content: caption.trim() || '',
                        content_type: 'video',
                        media_urls: [publicUrl],
                        visibility: 'public',
                        like_count: 0,
                        comment_count: 0,
                        share_count: 0,
                        link_url: reelRow?.id ? `/hub/reels?id=${reelRow.id}` : null,
                    });
            } catch (feedErr) {
                console.warn('[UploadReel] Feed post creation failed (non-fatal):', feedErr.message);
            }

            if (!wasBackground) {
                setUploadProgress(100);
                setUploadLabel('Done!');
            }

            if (wasBackground) {
                // Modal already closed — fire persistent clickable "Your reel is live!" toast
                toast.action(
                    '✅ Your reel is live! Tap to see it.',
                    () => { window.location.href = '/hub/social-media'; },
                    'success'
                );
            } else {
                // Quick upload — normal success callback (closes modal)
                onSuccess?.();
            }
        } catch (err) {
            console.warn('Upload error:', err);
            // Only update error state if modal is still mounted
            // (bgUpload already shows an error toast if it was in background mode)
            if (mountedRef.current) {
                setUploading(false);
                setError(err.message || 'Failed to upload reel');
            }
        } finally {
            if (mountedRef.current) setUploading(false);
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
