import React, { useState, useEffect, useRef } from 'react';
import { defaultTheme } from './MessengerTheme';
import { getAccessToken, authedFetch } from '../../lib/authUtils';

export function MessageInput({ 
    onSend, 
    onTyping, 
    onMediaUpload, 
    onGifSend, 
    onVoiceSend, 
    disabled, 
    autoFocus, 
    initialText,
    theme: C = defaultTheme 
}) {
    const [text, setText] = useState(initialText || '');
    const [showEmoji, setShowEmoji] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifSearchQuery, setGifSearchQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loadingGifs, setLoadingGifs] = useState(false);
    const [gifError, setGifError] = useState('');
    const [uploading, setUploading] = useState(false);
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

    useEffect(() => {
        return () => {
            clearInterval(recordingTimerRef.current);
            if (recordingMaxTimerRef.current) clearTimeout(recordingMaxTimerRef.current);
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
        onSend(text.trim());
        setText('');
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

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
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
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
            });
            audioChunksRef.current = [];
            mediaRecorderRef.current = mediaRecorder;

            const recordingStartTime = Date.now();

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
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
        <div style={{
            padding: '12px 16px',
            background: C.card,
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            position: 'relative',
        }}>
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !onMediaUpload) return;
                    setUploading(true);
                    try {
                        await onMediaUpload(file);
                    } finally {
                        setUploading(false);
                        e.target.value = '';
                    }
                }}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
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
                style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
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
                                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Set GIPHY_API_KEY in Vercel to enable</div>
                            </div>
                        ) : gifs.length === 0 ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: C.textSec }}>No GIFs found</div>
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
                        Powered by GIPHY
                    </div>
                </div>
            )}

            <div style={{
                flex: 1,
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
                    placeholder="Aa"
                    disabled={disabled}
                    rows={1}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        padding: '10px 0',
                        fontSize: 15,
                        outline: 'none',
                        boxShadow: 'none',
                        WebkitAppearance: 'none',
                        color: '#050505',
                        resize: 'none',
                        overflow: 'hidden',
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
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 4,
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
            ) : text.trim() ? (
                <button
                    onClick={handleSend}
                    style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: C.blue,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        flexShrink: 0,
                    }}
                    title="Send Message"
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
                            style={{
                                width: 32, height: 32, borderRadius: '50%', border: 'none',
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
                        style={{
                            width: 36,
                            height: 36,
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
                        title="Tap to send 👍 — Hold for emoji picker"
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; } }}>
                        👍
                    </button>
                </div>
            )}
        </div>
    );
}

MessageInput.displayName = 'MessageInput';
