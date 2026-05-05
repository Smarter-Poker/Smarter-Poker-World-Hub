/* ═══════════════════════════════════════════════════════════════════════════
   END STREAM MODAL — Post Now, Save to Lives, or Delete after streaming
   Shows after user ends live broadcast with video preview and options
   
   v2: Uses server-side /api/live/end-stream for reliable social_posts insert
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAccessToken } from '../../lib/authUtils';
import { busEmit } from '../../engine/EventBus';
import toast from '../../stores/toastStore';

let globalAudioCtx = null;
function initAudio() {
    if (!globalAudioCtx) {
        try {
            globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = globalAudioCtx.createOscillator();
            const gain = globalAudioCtx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(globalAudioCtx.destination);
            osc.start();
            osc.stop(globalAudioCtx.currentTime + 0.01);
        } catch (_) {}
    }
    if (globalAudioCtx?.state === 'suspended') globalAudioCtx.resume();
}

/** Play a short success chime via Web Audio API (no external file needed) */
function playSuccessChime() {
    try {
        const ctx = globalAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, ctx.currentTime);       // C5
        osc1.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime + 0.15);
        osc1.stop(ctx.currentTime + 0.5);
        osc2.stop(ctx.currentTime + 0.5);
        setTimeout(() => { if (ctx !== globalAudioCtx) ctx.close(); }, 600);
    } catch (_) { /* Web Audio not available — silent fallback */ }
}

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
    // BUG FIX (ESM-2): if thumbnailUrl prop is null, we auto-extract a frame
    // from the recorded blob and upload it so the social post gets a thumbnail.
    const [resolvedThumbUrl, setResolvedThumbUrl] = useState(thumbnailUrl || null);
    const thumbExtractedRef = useRef(false);

    // Extract a thumbnail from the blob if we don't have one from the streamer
    useEffect(() => {
        if (resolvedThumbUrl || thumbExtractedRef.current || !videoBlob || !user?.id || !streamId) return;
        thumbExtractedRef.current = true;
        const vidEl = document.createElement('video');
        vidEl.muted = true;
        vidEl.playsInline = true;
        const blobUrl = URL.createObjectURL(videoBlob);
        // FIX: safety revoke after 30s in case onseeked/onerror never fire
        const safetyRevoke = setTimeout(() => { URL.revokeObjectURL(blobUrl); }, 30000);
        vidEl.src = blobUrl;
        vidEl.onloadedmetadata = () => {
            vidEl.currentTime = Math.min(3.5, (vidEl.duration || 10) / 2);
        };
        vidEl.onseeked = async () => {
            clearTimeout(safetyRevoke);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = vidEl.videoWidth || 640;
                canvas.height = vidEl.videoHeight || 360;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(vidEl, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const path = `live-thumbnails/${user.id}/${streamId}-auto.jpg`;
                    const tok = (await getAccessToken()) || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/live-recordings/${path}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${tok}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
                        body: blob,
                    });
                    if (res.ok) {
                        // Get public URL from supabase SDK pattern
                        const pubUrl = `${SUPABASE_URL}/storage/v1/object/public/live-recordings/${path}`;
                        setResolvedThumbUrl(pubUrl);
                        // Also update the live_streams row so end-stream API picks it up
                        await supabase.from('live_streams').update({ thumbnail_url: pubUrl }).eq('id', streamId);
                    }
                }, 'image/jpeg', 0.8);
            } catch (e) { console.warn('[EndStreamModal] thumb extract failed:', e); }
            URL.revokeObjectURL(blobUrl);
        };
        vidEl.onerror = () => { clearTimeout(safetyRevoke); URL.revokeObjectURL(blobUrl); };
    }, [videoBlob, user?.id, streamId, resolvedThumbUrl]);

    // Set video source when blob is available
    // FIX: revoke previous objectURL on change/unmount to prevent memory leak
    useEffect(() => {
        if (!videoBlob || !videoRef.current) return;
        const objectUrl = URL.createObjectURL(videoBlob);
        videoRef.current.src = objectUrl;
        return () => { URL.revokeObjectURL(objectUrl); };
    }, [videoBlob]);

    const formatDuration = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const uploadVideo = async (onProgress) => {
        if (!videoBlob || !user?.id || !streamId) return null;

        const filename = `${user.id}/${streamId}.webm`;
        const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        // Get access token for authenticated upload
        // BUG FIX (ESM-3): use getAccessToken() instead of raw localStorage read
        const accessToken = getAccessToken() || SUPABASE_ANON_KEY;

        // Use XHR for real upload progress instead of Supabase SDK
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/live-recordings/${filename}`);
            xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
            xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
            xhr.setRequestHeader('Content-Type', 'video/webm');
            xhr.setRequestHeader('x-upsert', 'true');

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    onProgress(pct);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    // Build public URL
                    const { data: urlData } = supabase.storage
                        .from('live-recordings')
                        .getPublicUrl(filename);
                    resolve(urlData.publicUrl);
                } else {
                    reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(videoBlob);
        });
    };

    /** Call the server-side endpoint for post/save/delete */
    const callEndStream = async (action) => {
        const token = getAccessToken();
        const resp = await fetch('/api/live/end-stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: 'same-origin',
            body: JSON.stringify({ stream_id: streamId, action, caption: caption || undefined }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `${action} failed`);
        return data;
    };

    const handlePostNow = async () => {
        try { initAudio(); } catch (e) {}
        setIsUploading(true);
        setError('');
        setUploadProgress(1);

        try {
            // 1. Upload video to storage with real progress
            const videoUrl = await uploadVideo((pct) => {
                // Map upload progress to 1-65% range
                setUploadProgress(Math.max(1, Math.round(pct * 0.65)));
            });
            if (!videoUrl) throw new Error('No recording available to upload');
            setUploadProgress(70);

            // 2. Update stream record with video URL (client-side, owns the row)
            await supabase
                .from('live_streams')
                .update({
                    video_url: videoUrl,
                    // BUG FIX (ESM-2): use resolvedThumbUrl (may be auto-extracted from blob)
                    thumbnail_url: resolvedThumbUrl || thumbnailUrl || null,
                })
                .eq('id', streamId);

            setUploadProgress(80);

            // 3. Server-side: mark as posted + create social_posts entry (service role)
            const endResult = await callEndStream('post');

            setUploadProgress(100);

            // BUG FIX (ESM-5): Success feedback — chime + toast
            toast.info('Your Stream Was Posted Successfully.', 3000);
            setTimeout(() => { playSuccessChime(); }, 100);

            // BUG FIX (ESM-6): Trigger feed refresh so the new post
            // appears at the top of the social feed immediately
            busEmit.socialPostCreated?.(endResult?.postId, user?.id);

            onClose('posted');
        } catch (err) {
            console.warn('Post error:', err);
            setError(err.message || 'Failed to post stream');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveToLives = async () => {
        setIsUploading(true);
        setError('');
        setUploadProgress(1);

        try {
            // 1. Upload video with real progress
            const videoUrl = await uploadVideo((pct) => {
                setUploadProgress(Math.max(1, Math.round(pct * 0.7)));
            });
            if (!videoUrl) throw new Error('No recording available to upload');
            setUploadProgress(75);

            // 2. Update stream record with video URL
            await supabase
                .from('live_streams')
                .update({
                    video_url: videoUrl,
                    // BUG FIX (ESM-2): use resolvedThumbUrl (may be auto-extracted from blob)
                    thumbnail_url: resolvedThumbUrl || thumbnailUrl || null,
                })
                .eq('id', streamId);

            // 3. Server-side: mark as draft
            await callEndStream('save');

            setUploadProgress(100);

            // BUG FIX (ESM-5): Success feedback for save action too
            playSuccessChime();
            toast.success('Stream saved to your Lives!', 3000);

            // BUG FIX: Refetch feed so the post vanishes locally
            busEmit.socialPostCreated?.();

            onClose('saved');
        } catch (err) {
            console.warn('Save error:', err);
            setError(err.message || 'Failed to save stream');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Delete this recording? This cannot be undone.')) return;

        try {
            await callEndStream('delete');
            
            // BUG FIX: Refetch feed so ghost post vanishes locally
            busEmit.socialPostCreated?.();

            onClose('deleted');
        } catch (err) {
            console.warn('Delete error:', err);
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
                alignItems: 'flex-start',
                justifyContent: 'center',
                overflowY: 'auto',
                padding: 'max(20px, env(safe-area-inset-top, 20px)) 0 max(20px, env(safe-area-inset-bottom, 20px))',
            }}
        >
            <div
                style={{
                    background: C.card,
                    borderRadius: 12,
                    width: 'min(500px, 90vw)',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    WebkitOverflowScrolling: 'touch',
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
                        Stream Ended
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
                            alt="Stream Preview"
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
                        placeholder="Add A Caption... (optional)"
                        disabled={isUploading}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            fontSize: 15,
                            outline: 'none',
                            boxSizing: 'border-box',
                            color: C.text,
                            background: 'white',
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
                        {error}
                    </div>
                )}

                {/* #13: No recording warning */}
                {!videoBlob && (
                    <div style={{ padding: '0 16px 16px', color: '#FFA500', fontSize: 13, fontWeight: 600 }}>
                        Recording not available — this stream was live-only and cannot be saved or posted.
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
                        disabled={isUploading || !videoBlob}
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            borderRadius: 8,
                            border: 'none',
                            background: C.blue,
                            color: 'white',
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: (isUploading || !videoBlob) ? 'not-allowed' : 'pointer',
                            opacity: (isUploading || !videoBlob) ? 0.4 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                        }}
                    >
                        Post Now
                    </button>

                    {/* Save to Lives - Secondary */}
                    <button
                        onClick={handleSaveToLives}
                        disabled={isUploading || !videoBlob}
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            background: 'white',
                            color: C.text,
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: (isUploading || !videoBlob) ? 'not-allowed' : 'pointer',
                            opacity: (isUploading || !videoBlob) ? 0.4 : 1,
                        }}
                    >
                        Save to Lives
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
                        Delete Recording
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EndStreamModal;
