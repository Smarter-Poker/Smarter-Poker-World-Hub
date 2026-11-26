import React, { useState, useEffect, useRef } from 'react';
import { defaultTheme } from './MessengerTheme';
import { getAccessToken, authedFetch } from '../../lib/authUtils';
import { resolveUploadMedia, selectVoiceRecordingMime } from '../../lib/messenger/messageMedia.mjs';

export function MessageInput({ 
    onSend, 
    onTyping, 
    onMediaUpload, 
    onGifSend, 
    onVoiceSend, 
    stagedFile = null,
    onStagedFileConsumed,
    disabled, 
    autoFocus, 
    initialText,
    value,
    onDraftChange,
    theme: C = defaultTheme 
}) {
    const [localText, setLocalText] = useState(initialText || '');
    const text = value === undefined ? localText : value;
    const setText = next => {
        const resolved = typeof next === 'function' ? next(text) : next;
        if (onDraftChange) onDraftChange(resolved);
        else setLocalText(resolved);
    };
    const [showEmoji, setShowEmoji] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifSearchQuery, setGifSearchQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loadingGifs, setLoadingGifs] = useState(false);
    const [gifError, setGifError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [pendingMedia, setPendingMedia] = useState(null);
    const [mediaError, setMediaError] = useState('');
    const uploadAbortRef = useRef(null);
    const pendingPreviewUrlRef = useRef(null);
    // Voice recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const recordingMaxTimerRef = useRef(null); 
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const gifSearchTimer = useRef(null);

    const clearPendingMedia = () => {
        if (pendingPreviewUrlRef.current) {
            URL.revokeObjectURL(pendingPreviewUrlRef.current);
            pendingPreviewUrlRef.current = null;
        }
        setPendingMedia(null);
        setMediaError('');
    };

    const stageMediaFile = (file) => {
        if (!file) return false;
        const resolved = resolveUploadMedia(file);
        if (!resolved) {
            setMediaError('Only Images And Videos Are Supported');
            return false;
        }
        const maxSize = resolved.kind === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setMediaError(`File Too Large. Max ${resolved.kind === 'video' ? '50MB' : '10MB'}`);
            return false;
        }
        if (pendingPreviewUrlRef.current) {
            URL.revokeObjectURL(pendingPreviewUrlRef.current);
            pendingPreviewUrlRef.current = null;
        }
        const previewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(file)
            : '';
        pendingPreviewUrlRef.current = previewUrl || null;
        setMediaError('');
        setPendingMedia({
            file,
            kind: resolved.kind,
            mimeType: resolved.mimeType,
            name: file.name || (resolved.kind === 'video' ? 'Video' : 'Photo'),
            previewUrl,
        });
        setShowEmoji(false);
        setShowGifPicker(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return true;
    };

    useEffect(() => {
        if (!stagedFile) return;
        stageMediaFile(stagedFile);
        onStagedFileConsumed?.();
    }, [stagedFile]);

    useEffect(() => {
        return () => {
            clearInterval(recordingTimerRef.current);
            if (recordingMaxTimerRef.current) clearTimeout(recordingMaxTimerRef.current);
            if (uploadAbortRef.current) {
                try { uploadAbortRef.current.abort(); } catch { /* unmounting */ }
            }
            if (pendingPreviewUrlRef.current) {
                URL.revokeObjectURL(pendingPreviewUrlRef.current);
                pendingPreviewUrlRef.current = null;
            }
            try {
                if (mediaRecorderRef.current) {
                    if (mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.ondataavailable = null;
                        mediaRecorderRef.current.onstop = null;
                        mediaRecorderRef.current.stop();
                    }
                    mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
                }
            } catch (_) { /* ignore — component is unmounting */ }
        };
    }, []);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            const timer = setTimeout(() => inputRef.current?.focus(), 150);
            return () => clearTimeout(timer);
        }
    }, [autoFocus]);

    const emojis = ['😀', '😂', '❤️', '👍', '🔥', '😮', '😎', '🤔', '👏', '💯', '♠️', '♥️', '♦️', '♣️', '🃏', '🎰'];

    // Long-press state for thumbs-up button
    const thumbsLongPress = useRef(null);
    const thumbsTouchMoved = useRef(false);
    const didLongPress = useRef(false);

    const handleSend = () => {
        if (!text.trim()) return;
        const submitted = text;
        onSend(text.trim(), { consumeDraft: true, onRecorded: () => { if (!onDraftChange) setLocalText(current => current === submitted ? '' : current); } });
        setShowEmoji(false);
        if (navigator.vibrate) navigator.vibrate(15);
        inputRef.current?.focus();
        if (inputRef.current) inputRef.current.style.height = 'auto';
    };

    const handleThumbsUp = () => {
        if (didLongPress.current) { didLongPress.current = false; return; }
        onSend('👍');
        if (navigator.vibrate) navigator.vibrate(15);
    };

    const handleThumbsTouchStart = () => {
        thumbsTouchMoved.current = false;
        didLongPress.current = false;
        thumbsLongPress.current = setTimeout(() => {
            if (!thumbsTouchMoved.current) {
                didLongPress.current = true;
                setShowEmoji(true);
                setShowGifPicker(false);
                if (navigator.vibrate) navigator.vibrate(30);
            }
        }, 400);
    };
    const handleThumbsTouchMove = () => {
        thumbsTouchMoved.current = true;
        if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; }
    };
    const handleThumbsTouchEnd = () => {
        if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; }
    };

    const sendPendingMedia = async () => {
        if (!pendingMedia || !onMediaUpload || uploading) return;
        const mediaToSend = pendingMedia;
        const caption = text.trim();
        const submitted = text;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        uploadAbortRef.current = controller;
        setUploading(true);
        setUploadProgress(0);
        setShowEmoji(false);
        setMediaError('');
        try {
            const result = await onMediaUpload(mediaToSend.file, {
                caption,
                signal: controller?.signal,
                onProgress: (pct) => setUploadProgress(pct),
            });
            if (result?.ok !== false) {
                clearPendingMedia();
                if (caption) {
                    if (onDraftChange) onDraftChange('');
                    else setLocalText(current => current === submitted ? '' : current);
                    if (inputRef.current) inputRef.current.style.height = 'auto';
                }
            }
        } finally {
            if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
            setUploading(false);
            setUploadProgress(null);
        }
        inputRef.current?.focus();
    };

    const handleSubmit = () => {
        if (pendingMedia) {
            void sendPendingMedia();
            return;
        }
        handleSend();
    };

    const handleCancelUpload = () => {
        if (uploadAbortRef.current) {
            try { uploadAbortRef.current.abort(); } catch { /* ignore */ }
        }
    };

    const handlePaste = (e) => {
        if (!onMediaUpload || uploading) return;
        const items = Array.from(e.clipboardData?.items || []);
        for (const item of items) {
            if (item.kind === 'file') {
                const pasted = item.getAsFile?.();
                if (pasted && resolveUploadMedia(pasted)) {
                    e.preventDefault();
                    stageMediaFile(pasted);
                    return;
                }
            }
        }
        const files = Array.from(e.clipboardData?.files || []);
        const matched = files.find(f => resolveUploadMedia(f));
        if (matched) {
            e.preventDefault();
            stageMediaFile(matched);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleChange = (e) => {
        setText(e.target.value);
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
        }
        if (onTyping && e.target.value.length > 0) {
            onTyping();
        }
    };

    const loadTrendingGifs = async () => {
        setLoadingGifs(true);
        setGifError('');
        try {
            const gifToken = getAccessToken();
            const resp = await authedFetch('/api/messenger/gif-search?limit=20', {
                headers: gifToken ? { Authorization: `Bearer ${gifToken}` } : {},
            });
            const data = await resp.json();
            if (data.success) {
                setGifs(data.gifs);
            } else {
                setGifError(data.error || 'Failed to load GIFs');
            }
        } catch (e) {
            console.warn('GIF load error:', e);
            setGifError('Unable to connect to GIF service');
        }
        setLoadingGifs(false);
    };

    const searchGifs = (query) => {
        if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current);
        setGifSearchQuery(query);
        if (!query || query.length < 2) {
            loadTrendingGifs();
            return;
        }
        gifSearchTimer.current = setTimeout(async () => {
            setLoadingGifs(true);
            setGifError('');
            try {
                const gifToken = getAccessToken();
                const resp = await authedFetch(`/api/messenger/gif-search?q=${encodeURIComponent(query)}&limit=20`, {
                    headers: gifToken ? { Authorization: `Bearer ${gifToken}` } : {},
                });
                const data = await resp.json();
                if (data.success) {
                    setGifs(data.gifs);
                } else {
                    setGifError(data.error || 'Search failed');
                }
            } catch (e) {
                console.warn('GIF search error:', e);
                setGifError('Unable to search GIFs');
            }
            setLoadingGifs(false);
        }, 300);
    };

    const handleGifToggle = () => {
        const opening = !showGifPicker;
        setShowGifPicker(opening);
        setShowEmoji(false);
        if (opening) loadTrendingGifs();
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredMime = selectVoiceRecordingMime(
                typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
                    ? (t) => MediaRecorder.isTypeSupported(t)
                    : null,
            );
            const mediaRecorder = preferredMime
                ? new MediaRecorder(stream, { mimeType: preferredMime })
                : new MediaRecorder(stream);
            audioChunksRef.current = [];
            mediaRecorderRef.current = mediaRecorder;

            const recordingStartTime = Date.now();

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                const recordedMime = mediaRecorder.mimeType || preferredMime || 'audio/webm';
                const blob = new Blob(audioChunksRef.current, { type: recordedMime });
                const realDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
                if (blob.size > 500 && onVoiceSend) {
                    onVoiceSend(blob, realDuration);
                }
                clearInterval(recordingTimerRef.current);
                setRecordingDuration(0);
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            setRecordingDuration(0);
            if (navigator.vibrate) navigator.vibrate(30);

            const startTime = Date.now();
            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);

            recordingMaxTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    stopRecording();
                }
            }, 60000);
        } catch (err) {
            console.warn('Microphone access denied:', err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        clearInterval(recordingTimerRef.current);
        if (recordingMaxTimerRef.current) clearTimeout(recordingMaxTimerRef.current);
        if (navigator.vibrate) navigator.vibrate(15);
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.ondataavailable = null;
            mediaRecorderRef.current.onstop = null;
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
        }
        audioChunksRef.current = [];
        setIsRecording(false);
        setRecordingDuration(0);
        clearInterval(recordingTimerRef.current);
        if (recordingMaxTimerRef.current) clearTimeout(recordingMaxTimerRef.current);
    };

    const formatRecordingTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div
            style={{
                background: C.card,
                borderTop: `1px solid ${C.border}`,
                position: 'relative',
            }}
        >
            {mediaError && (
                <div role="alert" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 14px',
                    background: 'rgba(228, 30, 63, 0.1)',
                    color: C.red,
                    fontSize: 12,
                    fontWeight: 600,
                    borderBottom: `1px solid ${C.border}`,
                }}>
                    <span>{mediaError}</span>
                    <button
                        type="button"
                        aria-label="Dismiss Attachment Error"
                        onClick={() => setMediaError('')}
                        style={{ border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 16, padding: 0 }}
                    >×</button>
                </div>
            )}

            {uploading && (
                <div data-upload-progress role="status" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    background: C.bg,
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 12,
                    color: C.text,
                }}>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {uploadProgress != null ? `Uploading ${uploadProgress}%` : 'Uploading...'}
                    </span>
                    <div style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 999,
                        background: C.border,
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${Math.max(5, uploadProgress ?? 15)}%`,
                            height: '100%',
                            background: C.blue,
                            borderRadius: 999,
                            transition: 'width 0.15s ease-out',
                        }} />
                    </div>
                    <button
                        type="button"
                        aria-label="Cancel Upload"
                        onClick={handleCancelUpload}
                        style={{
                            border: `1px solid ${C.border}`,
                            background: C.card,
                            color: C.red,
                            borderRadius: 12,
                            padding: '3px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >Cancel</button>
                </div>
            )}

            {pendingMedia && !uploading && (
                <div data-attachment-preview style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    background: C.bg,
                    borderBottom: `1px solid ${C.border}`,
                }}>
                    <div style={{
                        position: 'relative',
                        width: 64,
                        height: 64,
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: `1px solid ${C.border}`,
                        background: pendingMedia.kind === 'video' ? '#000' : C.card,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {pendingMedia.kind === 'video' ? (
                            <video
                                src={pendingMedia.previewUrl}
                                muted
                                playsInline
                                preload="metadata"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                        ) : (
                            <img
                                src={pendingMedia.previewUrl}
                                alt="Attachment Preview"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {pendingMedia.kind === 'video' ? 'Video Ready To Send' : 'Photo Ready To Send'}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {pendingMedia.name}
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="Remove Attachment"
                        onClick={clearPendingMedia}
                        style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            border: `1px solid ${C.border}`,
                            background: C.card,
                            color: C.textSec,
                            cursor: 'pointer',
                            fontSize: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                        title="Remove Attachment"
                    >×</button>
                </div>
            )}

            <div style={{
                padding: '8px clamp(6px, 2.5vw, 16px)',
                paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
                display: 'flex',
                alignItems: 'flex-end',
                gap: 'clamp(2px, 1vw, 8px)',
                position: 'relative',
            }}>
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file || !onMediaUpload) return;
                    stageMediaFile(file);
                }}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Send Photo Or Video"
                style={{
                    width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: 'none',
                    background: 'transparent', cursor: uploading ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: uploading ? 0.5 : 1, padding: 0,
                }}
                title="Send Photo Or Video"
            >
                {uploading ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}>
                        <circle cx="12" cy="12" r="10" stroke={C.blue} strokeWidth="2" fill="none" strokeDasharray="31.4" strokeLinecap="round">
                            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                        </circle>
                    </svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}>
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke={C.blue} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>

            <button
                onClick={handleGifToggle}
                aria-label="Send GIF"
                style={{
                    width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: 'none',
                    background: showGifPicker ? C.bg : 'transparent', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
                title="Send GIF"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="14" rx="2" stroke={C.blue} strokeWidth="1.5" />
                    <text x="12" y="14" textAnchor="middle" fontSize="7" fontWeight="bold" fill={C.blue}>GIF</text>
                </svg>
            </button>

            {showGifPicker && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0,
                    marginBottom: 4, background: C.card, borderRadius: 12,
                    boxShadow: '0 -4px 16px rgba(0,0,0,0.15)', zIndex: 200,
                    maxHeight: 340, display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                        <input
                            type="text" value={gifSearchQuery}
                            onChange={e => searchGifs(e.target.value)}
                            placeholder="Search GIFs..."
                            style={{
                                width: '100%', border: 'none', background: C.bg,
                                borderRadius: 20, padding: '8px 12px', fontSize: 14,
                                outline: 'none', color: C.text,
                            }}
                            autoFocus
                        />
                    </div>
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: 8,
                        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 8, maxHeight: 280,
                    }}>
                        {loadingGifs ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: C.textSec }}>Loading...</div>
                        ) : gifError ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: C.textSec }}>
                                <div style={{ fontSize: 24, marginBottom: 8 }}>🎞️</div>
                                <div style={{ fontSize: 13 }}>{gifError}</div>
                                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Set GIPHY_API_KEY In Vercel To Enable</div>
                            </div>
                        ) : gifs.length === 0 ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: C.textSec }}>No GIFs Found</div>
                        ) : gifs.map(gif => (
                            <img
                                key={gif.id} src={gif.preview || gif.url} alt={gif.title}
                                onClick={() => {
                                    onGifSend?.(gif.url);
                                    setShowGifPicker(false);
                                    setGifSearchQuery('');
                                }}
                                style={{
                                    width: '100%', height: 120, objectFit: 'cover',
                                    borderRadius: 8, cursor: 'pointer',
                                    background: C.bg, border: `1px solid ${C.border}`,
                                }}
                                loading="lazy"
                            />
                        ))}
                    </div>
                    <div style={{ padding: '4px 12px', textAlign: 'center', fontSize: 10, color: C.textSec, borderTop: `1px solid ${C.border}` }}>
                        Powered By GIPHY
                    </div>
                </div>
            )}

            {/* minWidth 0: without it the textarea's default 20-column width
                pushed the send button off a phone screen. */}
            <div style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                background: C.bg,
                borderRadius: 24,
                padding: '0 12px',
                position: 'relative',
            }}>
                <textarea
                    ref={inputRef}
                    className="no-focus-ring"
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={pendingMedia ? 'Add A Caption...' : 'Aa'}
                    aria-label={pendingMedia ? 'Add A Caption' : 'Message'}
                    maxLength={2000}
                    disabled={disabled}
                    rows={1}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        padding: '10px 0',
                        fontSize: 15,
                        outline: 'none',
                        boxShadow: 'none',
                        WebkitAppearance: 'none',
                        color: C.inputText,
                        caretColor: C.inputText,
                        resize: 'none',
                        overflowY: 'auto',
                        lineHeight: 1.4,
                        maxHeight: 120,
                        fontFamily: 'inherit',
                    }}
                />
                <style dangerouslySetInnerHTML={{ __html: `
                    .no-focus-ring:focus-visible { box-shadow: none !important; outline: none !important; border: none !important; }
                    .no-focus-ring:focus { box-shadow: none !important; outline: none !important; border: none !important; }
                ` }} />

                <button
                    onClick={() => { setShowEmoji(!showEmoji); setShowGifPicker(false); }}
                    aria-label="Choose Emoji"
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 0,
                        minWidth: 40,
                        minHeight: 40,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    title="Choose Emoji"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke={C.blue} strokeWidth="1.5" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="9" cy="10" r="1" fill={C.blue} />
                        <circle cx="15" cy="10" r="1" fill={C.blue} />
                    </svg>
                </button>

                {showEmoji && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: 8,
                        background: C.card,
                        borderRadius: 12,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        padding: 10,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 6,
                        zIndex: 100,
                        minWidth: 200,
                    }}>
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => { setText(prev => prev + emoji); setShowEmoji(false); if (navigator.vibrate) navigator.vibrate(10); }}
                                style={{
                                    width: 44, height: 44, border: 'none', borderRadius: 10,
                                    background: 'transparent', cursor: 'pointer', fontSize: 24,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.15s',
                                }}
                                onTouchStart={e => e.currentTarget.style.background = C.hoverBg}
                                onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
                            >{emoji}</button>
                        ))}
                    </div>
                )}
            </div>

            {isRecording ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                        onClick={cancelRecording}
                        style={{
                            width: 32, height: 32, borderRadius: '50%', border: 'none',
                            background: C.red, cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', padding: 0,
                            flexShrink: 0,
                        }}
                        title="Cancel Recording"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 13, color: C.red, fontWeight: 600,
                    }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: C.red, animation: 'pulse 1s infinite',
                        }} />
                        {formatRecordingTime(recordingDuration)}
                    </div>
                    <button
                        onClick={stopRecording}
                        style={{
                            width: 36, height: 36, borderRadius: '50%', border: 'none',
                            background: C.blue, cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', padding: 0,
                            flexShrink: 0,
                        }}
                        title="Send Voice Message"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="white" />
                        </svg>
                    </button>
                </div>
            ) : (text.trim() || pendingMedia) ? (
                <button
                    onClick={handleSubmit}
                    disabled={uploading}
                    aria-label={pendingMedia ? 'Send Attachment' : 'Send Message'}
                    style={{
                        width: 40, height: 40, borderRadius: '50%', border: 'none',
                        background: C.blue,
                        cursor: uploading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        flexShrink: 0,
                        opacity: uploading ? 0.6 : 1,
                    }}
                    title={pendingMedia ? 'Send Attachment' : 'Send Message'}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                        <path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="white" />
                    </svg>
                </button>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {onVoiceSend && (
                        <button
                            onClick={startRecording}
                            aria-label="Record Voice Message"
                            style={{
                                width: 40, height: 40, borderRadius: '50%', border: 'none',
                                background: 'transparent', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', padding: 0,
                                flexShrink: 0, transition: 'transform 0.15s',
                            }}
                            title="Record Voice Message"
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill={C.blue}>
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={handleThumbsUp}
                        onTouchStart={handleThumbsTouchStart}
                        onTouchMove={handleThumbsTouchMove}
                        onTouchEnd={handleThumbsTouchEnd}
                        onMouseDown={() => {
                            didLongPress.current = false;
                            thumbsLongPress.current = setTimeout(() => {
                                didLongPress.current = true;
                                setShowEmoji(true);
                                setShowGifPicker(false);
                            }, 400);
                        }}
                        onMouseUp={() => { if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; } }}
                        aria-label="Send Like"
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            flexShrink: 0,
                            fontSize: 22,
                            transition: 'transform 0.15s',
                        }}
                        title="Tap To Send A Like - Hold For Emoji Picker"
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; } }}>
                        {'\u{1F44D}'}
                    </button>
                </div>
            )}
            </div>
        </div>
    );
}

MessageInput.displayName = 'MessageInput';
