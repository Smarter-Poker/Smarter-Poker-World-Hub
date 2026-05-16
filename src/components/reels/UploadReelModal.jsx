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
import { validateVideoFile, generateThumbnail, compressVideo } from '../../lib/videoCompressor';
import { uploadThumbnail } from '../../lib/thumbnailUploader';
import toast from '../../stores/toastStore';



export default function UploadReelModal({ user, onClose, onSuccess }) {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    // Phase label shown inside the progress bar ("Preparing upload…", "Uploading… 67%", etc.)
    const [uploadLabel, setUploadLabel] = useState('');
    const [caption, setCaption] = useState('');
    const [videoFile, setVideoFile] = useState(null);
    const [error, setError] = useState('');
    const [thumbnail, setThumbnail] = useState(null);
    const [compressPct, setCompressPct] = useState(null);
    const [preparingMedia, setPreparingMedia] = useState(false);

    // Mounted guard — prevents state updates after modal is unmounted by background mode
    const mountedRef = useRef(true);
    const compressionRef = useRef(null); // { controller, promise, result }
    const _uploadingRef = useRef(false); // double-click guard (synchronous, unlike React state)
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // Abort any running background compression
            if (compressionRef.current?.controller) {
                try { compressionRef.current.controller.abort(); } catch (_) {}
                compressionRef.current = null;
            }
        };
    }, []);

    const _pickerOpenRef = useRef(false);

    // ── iOS FILE PICKER PREPARATION DETECTION ────────────────────────────────
    // Uses visibilitychange for smarter iOS cancel detection (~2-5s vs 120s timeout).
    useEffect(() => {
        if (!preparingMedia) return;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && _pickerOpenRef.current) {
                setTimeout(() => {
                    if (_pickerOpenRef.current) {
                        setPreparingMedia(false);
                        _pickerOpenRef.current = false;
                    }
                }, 2000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        const timer = setTimeout(() => { setPreparingMedia(false); _pickerOpenRef.current = false; }, 120_000);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            clearTimeout(timer);
        };
    }, [preparingMedia]);

    const handleFileSelect = (e) => {
        // Clear iOS preparing indicator
        setPreparingMedia(false);
        _pickerOpenRef.current = false;

        const file = e.target.files?.[0];
        if (!file) return;

        // Use sniffMimeType — iOS Photo Library may return empty or codec-suffixed file.type
        const mime = sniffMimeType(file);
        if (!mime.startsWith('video/')) {
            setError('Please select a valid video file');
            return;
        }

        // ── Client-side file size validation ──
        const validation = validateVideoFile(file);
        if (!validation.valid) {
            setError(validation.error);
            return;
        }
        if (validation.warning) {
            toast.info(validation.warning, 5000);
        }
        if (validation.formatWarning) {
            toast.info(validation.formatWarning, 4000);
        }

        setVideoFile(file);
        setError('');
        setThumbnail(null);
        setCompressPct(null);

        // ⚡ INSTANT FEEDBACK
        const sizeMB = Math.round(file.size / (1024 * 1024));
        toast.info(`Video selected (${sizeMB}MB) — preparing upload…`, 3000);

        // ── Background processing while user types caption ──

        // 1. Auto-thumbnail generation
        generateThumbnail(file).then(thumb => {
            if (!mountedRef.current || !thumb) return;
            setThumbnail(thumb);
        });

        // 2. Background compression for large videos
        if (compressionRef.current?.controller) {
            compressionRef.current.controller.abort();
        }
        const controller = new AbortController();
        const compPromise = compressVideo(file, {
            signal: controller.signal,
            onProgress: ({ pct }) => {
                if (!mountedRef.current) return;
                setCompressPct(pct);
            },
        }).then(result => {
            if (compressionRef.current) compressionRef.current.result = result;
            if (result.compressed && mountedRef.current) {
                const savedMB = Math.round((result.originalSize - result.compressedSize) / (1024 * 1024));
                toast.success(`Video compressed \u2014 saved ${savedMB}MB (${result.savings}% smaller)`, 3000);
            }
            if (mountedRef.current) setCompressPct(null);
            return result;
        });
        compressionRef.current = { controller, promise: compPromise, result: null };

        // 3. Signed URL prefetch
        if (user?.id) {
            bgUpload.prefetch({ file, userId: user.id, folder: 'reels' });
        }
    };

    const handleUpload = async () => {
        if (!videoFile || !user) return;
        if (_uploadingRef.current) return; // Synchronous double-click guard
        _uploadingRef.current = true;

        setUploading(true);
        setError('');

        // ⚡ IMMEDIATE FEEDBACK — visible within 100ms, before any async work
        setUploadProgress(2);
        setUploadLabel('Preparing…');

        try {
            // ── Use compressed file if background compression finished ──
            let fileToUpload = videoFile;
            if (compressionRef.current?.promise) {
                try {
                    const result = compressionRef.current.result || await Promise.race([
                        compressionRef.current.promise,
                        new Promise(r => setTimeout(() => r({ file: videoFile, compressed: false }), 500)),
                    ]);
                    if (result.compressed) fileToUpload = result.file;
                } catch (_) { /* use original */ }
            }

            let bgUnsub = null;
            let wasBackground = false;

            const publicUrl = await new Promise((resolve, reject) => {
                // start() MUST be called before subscribe() because start() clears existing listeners
                // to supersede any pending uploads. If subscribe() is called first, it gets wiped.
                bgUpload.start({
                    file: fileToUpload,
                    userId: user.id,
                    folder: 'reels',
                    content: caption?.trim(),
                    thumbnail,
                }).catch(reject);

                bgUnsub = bgUpload.subscribe({
                    onProgress: ({ pct, label }) => {
                        if (!mountedRef.current) return;
                        setUploadProgress(pct);
                        setUploadLabel(label);
                    },
                    onComplete: ({ publicUrl, wasBackground: bg }) => {
                        wasBackground = bg;
                        resolve(publicUrl);
                    },
                    onError: ({ error }) => reject(error),
                    onBackground: () => {
                        onClose?.();
                    },
                });
            });
            if (bgUnsub) bgUnsub();
            compressionRef.current = null;

            if (!wasBackground) {
                setUploadProgress(94);
                setUploadLabel('Saving reel…');
            }

            // Upload thumbnail to Storage (best-effort — reel still saves if this fails)
            let thumbnailUrl = null;
            if (thumbnail && thumbnail.startsWith('data:') && user?.id) {
                thumbnailUrl = await uploadThumbnail(thumbnail, user.id, 'thumbnails').catch(() => null);
            }

            // Create social_reels entry
            const { data: reelRow, error: insertError } = await supabase
                .from('social_reels')
                .insert({
                    author_id: user.id,
                    video_url: publicUrl,
                    caption: caption.trim() || null,
                    thumbnail_url: thumbnailUrl,
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
                const { error: err_social_posts_cxvf8 } = await supabase
                  .from('social_posts')
                  .insert({
                        author_id: user.id,
                        content: caption.trim() || '',
                        content_type: 'video',
                        media_urls: [publicUrl],
                        thumbnail_url: thumbnailUrl,
                        visibility: 'public',
                        like_count: 0,
                        comment_count: 0,
                        share_count: 0,
                        link_url: reelRow?.id ? `/hub/reels?id=${reelRow.id}` : null,
                    });
                if (err_social_posts_cxvf8) console.warn('[Supabase] Silent mutation failed in social_posts:', err_social_posts_cxvf8.message);
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
                    () => { window.top.location.href = '/hub/social-media'; },
                    'success'
                );
            } else {
                // Quick upload — normal success callback (closes modal)
                onSuccess?.();
            }
        } catch (err) {
            console.warn('Upload error:', err);
            // Suppress user-initiated cancellations — these are intentional, not errors
            const isCancelled = err?.message === 'Upload cancelled' || err?.message === 'Upload aborted' || err?.message === 'Upload superseded';
            // Only update error state if modal is still mounted and it's a real failure
            if (mountedRef.current && !isCancelled) {
                setUploading(false);
                setError(err.message || 'Failed to upload reel');
            }
        } finally {
            _uploadingRef.current = false;
            if (mountedRef.current) setUploading(false);
        }
    };




    const fileSizeMB = videoFile ? (videoFile.size / (1024 * 1024)).toFixed(1) : 0;

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.header}>
                    <h2 style={styles.title}>Upload Reel</h2>
                    <button
                        onClick={() => {
                            if (uploading) {
                                // Warn user that an upload is in progress
                                const confirmed = window.confirm(
                                    'An upload is in progress. Cancel the upload and close?'
                                );
                                if (confirmed) {
                                    bgUpload.abort();
                                    onClose?.();
                                }
                            } else {
                                onClose?.();
                            }
                        }}
                        style={styles.closeButton}
                        aria-label="Close"
                    >✕</button>
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
                        <label htmlFor="video-upload" style={styles.fileLabel} onClick={() => { setPreparingMedia(true); _pickerOpenRef.current = true; }}>
                            {videoFile ? `📹 ${videoFile.name} (${fileSizeMB}MB)` : '📹 Choose Video'}
                        </label>
                    </div>

                    {/* iOS Preparing Indicator */}
                    {preparingMedia && (
                        <div style={{
                            padding: '12px 16px', background: 'rgba(24,119,242,0.15)',
                            borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10
                        }}>
                            <div style={{
                                width: 18, height: 18, border: '3px solid #1877F2', borderTopColor: 'transparent',
                                borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                            }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1877F2' }}>
                                Preparing Your Video — This May Take A Moment...
                            </span>

                        </div>
                    )}

                    {/* Video Thumbnail Preview */}
                    {thumbnail && (
                        <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                            <img src={thumbnail} alt="Video preview" style={{ width: '100%', height: 'auto', display: 'block' }} />
                            {compressPct != null && (
                                <div style={{
                                    position: 'absolute', bottom: 8, left: 8, right: 8,
                                    background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '4px 8px',
                                }}>
                                    <div style={{ color: '#42B72A', fontSize: 10, marginBottom: 2 }}>Compressing… {compressPct}%</div>
                                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', background: '#42B72A', width: `${compressPct}%`, transition: 'width 0.3s' }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Caption Input */}
                    <textarea
                        placeholder="Add A Caption..."
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        style={{ ...styles.textarea, opacity: uploading ? 0.5 : 1 }}
                        maxLength={500}
                        disabled={uploading}
                    />
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -12, marginBottom: 12 }}>
                        {caption.length}/500
                    </div>

                    {/* Upload Progress Bar */}
                    {uploading && (
                        <div style={styles.progressContainer}>
                            <div style={{ ...styles.progressBar, width: `${uploadProgress}%` }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                                <span style={styles.progressLabel}>
                                    {uploadLabel || `${uploadProgress}%`}
                                </span>
                                <button
                                    onClick={() => {
                                        bgUpload.abort();
                                        if (mountedRef.current) {
                                            setUploading(false);
                                            setUploadProgress(0);
                                            setUploadLabel('');
                                            _uploadingRef.current = false;
                                        }
                                    }}
                                    style={{
                                        background: 'none',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        borderRadius: 12,
                                        padding: '3px 12px',
                                        fontSize: 12,
                                        color: 'rgba(255,255,255,0.7)',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                        marginLeft: 8,
                                        flexShrink: 0,
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
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
