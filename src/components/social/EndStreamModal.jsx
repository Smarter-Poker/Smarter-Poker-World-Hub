/* ═══════════════════════════════════════════════════════════════════════════
   END STREAM MODAL — Post Now, Save to Lives, or Delete after streaming
   Shows after user ends live broadcast with video preview and options
   
   v2: Uses server-side /api/live/end-stream for reliable social_posts insert
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAccessToken } from '../../lib/authUtils';

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
        setIsUploading(true);
        setError('');
        setUploadProgress(10);

        try {
            // 1. Upload video to storage
            setUploadProgress(30);
            const videoUrl = await uploadVideo();
            if (!videoUrl) throw new Error('No recording available to upload');
            setUploadProgress(60);

            // 2. Update stream record with video URL (client-side, owns the row)
            await supabase
                .from('live_streams')
                .update({
                    video_url: videoUrl,
                    thumbnail_url: thumbnailUrl,
                })
                .eq('id', streamId);

            setUploadProgress(75);

            // 3. Server-side: mark as posted + create social_posts entry (service role)
            await callEndStream('post');

            setUploadProgress(100);
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
        setUploadProgress(10);

        try {
            // 1. Upload video
            setUploadProgress(30);
            const videoUrl = await uploadVideo();
            if (!videoUrl) throw new Error('No recording available to upload');
            setUploadProgress(70);

            // 2. Update stream record with video URL
            await supabase
                .from('live_streams')
                .update({
                    video_url: videoUrl,
                    thumbnail_url: thumbnailUrl,
                })
                .eq('id', streamId);

            // 3. Server-side: mark as draft
            await callEndStream('save');

            setUploadProgress(100);
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
