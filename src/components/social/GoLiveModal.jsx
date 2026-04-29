/**
 * GO LIVE MODAL — SmarterPoker Live Streaming v2
 * Features: LiveKit SFU • camera flip • share • reactions • analytics • schedule
 * Stages: setup → preview → countdown → live → ended
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { liveStreamService } from '../../services/LiveStreamService';
import { EndStreamModal } from './EndStreamModal';
import { LiveAnalyticsCard } from './LiveAnalyticsCard';
import { LiveReactions } from './LiveReactions';
import { ScheduleLiveModal } from './ScheduleLiveModal';
import { supabase } from '../../lib/supabase';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505',
    textSec: '#65676B', border: '#DADDE1', red: '#FA383E',
    blue: '#0066FF',
};

export function GoLiveModal({ isOpen, onClose, user }) {
    const [stage, setStage] = useState('preview'); // preview | countdown | live | ended
    const [title, setTitle] = useState('');
    const [error, setError] = useState('');
    const [viewerCount, setViewerCount] = useState(0);
    const [streamId, setStreamId] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [countdown, setCountdown] = useState(5);
    const [showControls, setShowControls] = useState(false); // tap-to-reveal
    const [comments, setComments] = useState([]);
    const [commentInput, setCommentInput] = useState('');
    const [controlsTimer, setControlsTimer] = useState(null);
    // New v2 state
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [slowMode, setSlowMode] = useState(false);
    const [isCameraFlipping, setIsCameraFlipping] = useState(false);

    // Thumbnail state
    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState(null);
    const [thumbnailUrl, setThumbnailUrl] = useState(null);

    const [recordedBlob, setRecordedBlob] = useState(null);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const commentsEndRef = useRef(null);
    const thumbnailInputRef = useRef(null);
    const hideControlsRef = useRef(null);
    const commentChannelRef = useRef(null);

    useEffect(() => {
        if (isOpen) { requestMediaAccess(); }
        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
            if (hideControlsRef.current) clearTimeout(hideControlsRef.current);
            if (commentChannelRef.current) supabase.removeChannel(commentChannelRef.current);
            // FIX: countdown interval cleanup was AFTER the return — unreachable dead code
            if (timerRef._cdInterval) { clearInterval(timerRef._cdInterval); timerRef._cdInterval = null; }
            // FIX: if modal is force-closed during live broadcast, end the broadcast to prevent zombie room
            if (liveStreamService.room && liveStreamService.isBroadcaster) {
                liveStreamService.endBroadcast().catch(() => {});
            }
            // FIX: null stale singleton callbacks
            liveStreamService.onViewerCountChange = null;
            liveStreamService.onReconnecting = null;
            liveStreamService.onReconnected = null;
        };
    }, [isOpen]);

    // Subscribe to viewer comments when stream goes live
    useEffect(() => {
        if (!streamId) return;
        const ch = supabase
            .channel(`live-comments-broadcaster-${streamId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `stream_id=eq.${streamId}` },
                (payload) => {
                    if (payload.new.user_id !== user?.id) { // Don't double-add own comments
                        setComments(prev => [...prev, payload.new]);
                    }
                }
            ).subscribe();
        commentChannelRef.current = ch;
        return () => { supabase.removeChannel(ch); };
    }, [streamId, user?.id]);

    useEffect(() => {
        if (streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [stage]);

    // Auto-scroll comments
    useEffect(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [comments]);

    const requestMediaAccess = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            setStage('preview');
            setError('');
        } catch (err) {
            setError('Camera access denied. Please allow camera and microphone permissions.');
        }
    };

    const handleThumbnailSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setThumbnailFile(file);
        // FIX: revoke previous blob URL to prevent memory leak
        if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
        setThumbnailPreview(URL.createObjectURL(file));
    };

    const captureThumbnail = () => {
        if (!videoRef.current) return null;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.8);
    };

    const uploadThumbnail = async (file) => {
        if (!file || !user?.id) return null;
        try {
            const ext = file.name.split('.').pop();
            const path = `live-thumbnails/${user.id}/${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('live-recordings')
                .upload(path, file, { contentType: file.type, upsert: true });
            if (uploadErr) throw uploadErr;
            const { data } = supabase.storage.from('live-recordings').getPublicUrl(path);
            return data.publicUrl;
        } catch (err) {
            console.warn('[GoLive] thumbnail upload failed:', err);
            return null;
        }
    };

    const startRecording = () => {
        if (!streamRef.current) return;
        recordedChunksRef.current = [];
        const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
        const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
        if (!mime) return;
        const mr = new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 2500000 });
        mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        mr.onstop = () => setRecordedBlob(new Blob(recordedChunksRef.current, { type: mime }));
        mr.start(1000);
        mediaRecorderRef.current = mr;
    };

    const handleGoLive = async () => {
        if (!streamRef.current || !user?.id) { setError('Unable to start stream.'); return; }
        setError('');
        setStage('countdown');
        setCountdown(5);

        // Upload thumbnail if provided, else auto-capture from video and upload
        let thumbUrl = null;
        if (thumbnailFile) {
            thumbUrl = await uploadThumbnail(thumbnailFile);
        } else if (user?.id) {
            // FIX: captureThumbnail() returns a data URL (can be several MB as base64).
            // Storing raw data URLs in a DB text column causes silent insert failures
            // on row size limits. Convert to Blob and upload to storage instead.
            const dataUrl = captureThumbnail();
            if (dataUrl) {
                try {
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    const autoFile = new File([blob], 'auto-thumb.jpg', { type: 'image/jpeg' });
                    thumbUrl = await uploadThumbnail(autoFile);
                } catch (_) { thumbUrl = null; /* non-fatal — stream continues without thumb */ }
            }
        }
        setThumbnailUrl(thumbUrl);

        // 5-second countdown
        let count = 5;
        // FIX: store interval so cleanup useEffect can cancel it if modal closes mid-countdown
        const cdInterval = setInterval(async () => {
            count--;
            setCountdown(count);
            if (count <= 0) {
                clearInterval(cdInterval);
                timerRef._cdInterval = null;
                await startBroadcast(thumbUrl);
            }
        }, 1000);
        timerRef._cdInterval = cdInterval;
    };

    const startBroadcast = async (thumbUrl) => {
        try {
            liveStreamService.onViewerCountChange = (c) => setViewerCount(c);
            // Wire reconnect handlers
            liveStreamService.onReconnecting = () => setIsReconnecting(true);
            liveStreamService.onReconnected = () => setIsReconnecting(false);

            const { streamId: newId } = await liveStreamService.startBroadcast(
                user.id,
                title || `${user.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Live'}'s Live`,
                streamRef.current,
                thumbUrl
            );
            setStreamId(newId);
            setStage('live');
            setElapsedTime(0);
            startRecording();
            timerRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
        } catch (err) {
            setError(err.message || 'Failed to start broadcast.');
            setStage('preview');
        }
    };

    const handleScreenTap = useCallback(() => {
        setShowControls(true);
        if (hideControlsRef.current) clearTimeout(hideControlsRef.current);
        hideControlsRef.current = setTimeout(() => setShowControls(false), 4000);
    }, []);

    const handleEndStream = async () => {
        try {
            if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop();
            await liveStreamService.endBroadcast();
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            setStage('ended');
            // Show analytics BEFORE end stream modal
            setShowAnalytics(true);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleFlipCamera = async () => {
        if (isCameraFlipping) return;
        setIsCameraFlipping(true);
        try {
            const newStream = await liveStreamService.flipCamera();
            if (newStream && videoRef.current) {
                // Update preview video
                videoRef.current.srcObject = newStream;
                streamRef.current = newStream;
            }
        } catch (err) {
            setError('Camera flip failed: ' + err.message);
        } finally {
            setIsCameraFlipping(false);
        }
    };

    const handleShare = async () => {
        const url = `${window.location.origin}/hub/social-media?stream=${streamId}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: title || 'Live Stream', url });
            } else {
                await navigator.clipboard.writeText(url);
                setError('Link copied to clipboard!'); // Reuse error for brief flash
                setTimeout(() => setError(''), 2500);
            }
        } catch { /* ignore user cancel */ }
    };

    const handleToggleSlowMode = async () => {
        if (!streamId) return;
        const newMode = !slowMode;
        setSlowMode(newMode);
        await liveStreamService.setSlowMode(streamId, newMode);
    };

    const handleSendComment = async () => {
        if (!commentInput.trim() || !streamId || !user?.id) return;
        const text = commentInput.trim();
        setCommentInput('');
        const newComment = { id: Date.now(), user_id: user.id, author_name: user.full_name || user.user_metadata?.full_name || 'You', text, created_at: new Date().toISOString() };
        setComments(prev => [...prev, newComment]);
        try {
            await supabase.from('live_comments').insert({
                stream_id: streamId, user_id: user.id, text, author_name: user.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Viewer',
            });
        } catch (err) { console.warn('[GoLive] comment failed:', err); }
    };

    const handleEndStreamModalClose = (action) => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setStage('preview');
        setRecordedBlob(null);
        setThumbnailUrl(null);
        setThumbnailFile(null);
        // FIX: revoke blob URL before clearing
        if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
        setThumbnailPreview(null);
        setStreamId(null);
        setElapsedTime(0);
        setComments([]);
        onClose(action);
    };

    const formatTime = (s) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        return `${m}:${String(sec).padStart(2,'0')}`;
    };

    if (!isOpen) return null;

    // Analytics card shows first after stream ends, then EndStreamModal
    if (stage === 'ended' && showAnalytics) {
        return (
            <LiveAnalyticsCard
                streamId={streamId}
                onContinue={() => setShowAnalytics(false)}
            />
        );
    }

    if (stage === 'ended') {
        return (
            <EndStreamModal
                isOpen={true}
                onClose={handleEndStreamModalClose}
                streamId={streamId}
                videoBlob={recordedBlob}
                thumbnailUrl={thumbnailUrl}
                duration={elapsedTime}
                user={user}
            />
        );
    }

    return (
        <>
        <div
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={(e) => { if (e.target === e.currentTarget && stage !== 'live') onClose(); }}
        >
            <style>{`
                @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.7;transform:scale(.96)} }
                @keyframes cdPop { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
                @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>

            <div style={{
                background: (stage === 'live' || stage === 'countdown') ? '#000' : C.card,
                borderRadius: (stage === 'live' || stage === 'countdown') ? 0 : 16,
                width: (stage === 'live' || stage === 'countdown') ? '100%' : 'min(560px, 92vw)',
                height: (stage === 'live' || stage === 'countdown') ? '100%' : 'auto',
                maxHeight: (stage === 'live' || stage === 'countdown') ? '100%' : '92vh',
                overflow: 'hidden',
                position: 'relative',
            }}>

                {/* ── PREVIEW STAGE ── */}
                {stage === 'preview' && (
                    <div>
                        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:C.text }}>Go Live</h2>
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                                <button
                                    onClick={() => setShowSchedule(true)}
                                    style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 12px', fontSize:13, color:C.textSec, cursor:'pointer' }}
                                >
                                    Schedule
                                </button>
                                <button onClick={onClose} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:C.textSec }}>✕</button>
                            </div>
                        </div>

                        {/* Camera preview */}
                        <div style={{ position:'relative', background:'#000', aspectRatio:'16/9' }}>
                            <video ref={videoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }} />
                            <div style={{ position:'absolute', top:10, left:10, background:'rgba(0,0,0,.55)', color:'white', padding:'4px 10px', borderRadius:6, fontSize:13, fontWeight:600 }}>Preview</div>
                        </div>

                        <div style={{ padding:20 }}>
                            {/* Thumbnail upload */}
                            <div style={{ marginBottom:16 }}>
                                <label style={{ display:'block', marginBottom:8, fontWeight:700, fontSize:14, color:C.text }}>
                                    Stream Thumbnail
                                </label>
                                <div
                                    onClick={() => thumbnailInputRef.current?.click()}
                                    style={{ border:`2px dashed ${thumbnailPreview ? C.red : C.border}`, borderRadius:10, padding:thumbnailPreview ? 0 : 20, textAlign:'center', cursor:'pointer', overflow:'hidden', position:'relative', minHeight:80 }}
                                >
                                    {thumbnailPreview ? (
                                        <img src={thumbnailPreview} alt="Thumbnail" style={{ width:'100%', maxHeight:160, objectFit:'cover', display:'block' }} />
                                    ) : (
                                        <div>
                                            <div style={{ fontSize:28, marginBottom:6 }}>🖼️</div>
                                            <div style={{ fontSize:13, color:C.textSec }}>Tap to upload a thumbnail <br/><span style={{ fontSize:11 }}>JPG, PNG — recommended 1280×720</span></div>
                                        </div>
                                    )}
                                    {thumbnailPreview && (
                                        <div style={{ position:'absolute', top:6, right:8, background:'rgba(0,0,0,.6)', color:'white', borderRadius:'50%', width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, cursor:'pointer' }}
                                            onClick={(e) => { e.stopPropagation(); if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview); setThumbnailPreview(null); setThumbnailFile(null); }}>✕</div>
                                    )}
                                </div>
                                <input ref={thumbnailInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleThumbnailSelect} />
                            </div>

                            {/* Stream title */}
                            <label style={{ display:'block', marginBottom:8, fontWeight:700, fontSize:14, color:C.text }}>Stream Title</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={`${user?.full_name || user?.user_metadata?.full_name || 'Your'}'s Live Stream`}
                                style={{ width:'100%', padding:'11px 14px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:15, outline:'none', boxSizing:'border-box', color:C.text }}
                            />

                            {error && <div style={{ color:C.red, marginTop:10, fontSize:14 }}>⚠️ {error}</div>}

                            <div style={{ display:'flex', gap:12, marginTop:18 }}>
                                <button onClick={onClose} style={{ flex:1, padding:'13px 20px', borderRadius:8, border:`1px solid ${C.border}`, background:'white', color:C.text, fontSize:15, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                                <button
                                    onClick={handleGoLive}
                                    style={{ flex:1, padding:'13px 20px', borderRadius:8, border:'none', background:C.red, color:'white', fontSize:15, fontWeight:700, cursor:'pointer' }}
                                >
                                    Go Live
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── COUNTDOWN STAGE ── */}
                {stage === 'countdown' && (
                    <div style={{ position:'relative', width:'100%', height:'100%', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', minHeight:'100vh' }}>
                        <video ref={videoRef} autoPlay muted playsInline style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', opacity:.4 }} />
                        <div style={{ position:'relative', zIndex:2, textAlign:'center' }}>
                            <div style={{ fontSize:16, color:'white', fontWeight:700, letterSpacing:3, marginBottom:16, textTransform:'uppercase', opacity:.85 }}>Get Ready</div>
                            <div style={{ fontSize:140, fontWeight:900, color:'white', lineHeight:1, animation:'cdPop .5s ease-out', textShadow:'0 0 60px rgba(0,120,255,.8)' }} key={countdown}>
                                {countdown}
                            </div>
                            <div style={{ fontSize:16, color:'rgba(255,255,255,.7)', marginTop:20 }}>Your stream is about to start</div>
                        </div>
                    </div>
                )}

                {/* ── LIVE STAGE ── */}
                {stage === 'live' && (
                    <div
                        style={{ height:'100%', width:'100%', position:'relative', background:'#000', cursor:'pointer', minHeight:'100vh' }}
                        onClick={handleScreenTap}
                    >
                        {/* Video feed */}
                        <video ref={videoRef} autoPlay muted playsInline style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }} />

                        {/* Reconnect overlay */}
                        {isReconnecting && (
                            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.7)', zIndex:30, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                                <div style={{ width:48, height:48, borderRadius:'50%', border:'4px solid rgba(255,255,255,0.2)', borderTopColor:'#0066FF', animation:'spin 0.8s linear infinite', marginBottom:16 }} />
                                <div style={{ color:'white', fontSize:16, fontWeight:700 }}>Reconnecting...</div>
                                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginTop:6 }}>Please wait</div>
                            </div>
                        )}

                        {/* TOP-LEFT: LIVE badge + REC */}
                        <div style={{ position:'absolute', top:20, left:16, display:'flex', gap:10, alignItems:'center', zIndex:10 }}>
                            <div style={{ background:C.red, color:'white', padding:'6px 14px', borderRadius:8, fontSize:15, fontWeight:800, animation:'livePulse 1.5s infinite', display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ width:8, height:8, borderRadius:'50%', background:'white', display:'inline-block' }} />
                                LIVE
                            </div>
                            <div style={{ background:'rgba(255,0,0,.75)', color:'white', padding:'5px 10px', borderRadius:7, fontSize:12, fontWeight:700 }}>
                                REC
                            </div>
                            {slowMode && (
                                <div style={{ background:'rgba(255,165,0,0.85)', color:'white', padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700 }}>
                                    SLOW
                                </div>
                            )}
                        </div>

                        {/* TOP-RIGHT: viewer count */}
                        <div style={{ position:'absolute', top:20, right:16, background:'rgba(0,0,0,.55)', color:'white', padding:'6px 14px', borderRadius:8, fontSize:14, fontWeight:600, zIndex:10, display:'flex', alignItems:'center', gap:6 }}>
                            <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                            {viewerCount} {viewerCount === 1 ? 'viewer' : 'viewers'}
                        </div>

                        {/* BOTTOM-RIGHT: elapsed timer */}
                        <div style={{ position:'absolute', bottom:110, right:16, background:'rgba(0,0,0,.55)', color:'white', padding:'6px 12px', borderRadius:8, fontSize:14, fontWeight:700, zIndex:10, fontVariantNumeric:'tabular-nums' }}>
                            {formatTime(elapsedTime)}
                        </div>

                        {/* Emoji reactions */}
                        <LiveReactions streamId={streamId} userId={user?.id} isBroadcaster />

                        {/* COMMENTS OVERLAY — left side, scrollable */}
                        <div style={{ position:'absolute', bottom:110, left:0, width:'min(320px, 60vw)', maxHeight:200, overflowY:'auto', zIndex:10, padding:'0 12px', scrollbarWidth:'none' }}>
                            {comments.map(c => (
                                <div key={c.id} style={{ animation:'slideUp .25s ease-out', marginBottom:6, display:'flex', alignItems:'flex-start', gap:6 }}>
                                    <span style={{ color:'#00CFFF', fontWeight:700, fontSize:13, whiteSpace:'nowrap' }}>{c.author_name}</span>
                                    <span style={{ color:'white', fontSize:13, lineHeight:1.4 }}>{c.text}</span>
                                </div>
                            ))}
                            <div ref={commentsEndRef} />
                        </div>

                        {/* COMMENT INPUT */}
                        <div style={{ position:'absolute', bottom:50, left:12, right:56, zIndex:10, display:'flex', gap:8 }}>
                            <input
                                value={commentInput}
                                onChange={e => setCommentInput(e.target.value)}
                                onKeyDown={e => { e.stopPropagation(); if(e.key==='Enter') handleSendComment(); }}
                                onClick={e => e.stopPropagation()}
                                placeholder="Say something..."
                                style={{ flex:1, padding:'9px 14px', borderRadius:22, border:'1.5px solid rgba(255,255,255,.3)', background:'rgba(0,0,0,.45)', color:'white', fontSize:14, outline:'none' }}
                            />
                            <button
                                onClick={e => { e.stopPropagation(); handleSendComment(); }}
                                style={{ padding:'9px 16px', borderRadius:22, border:'none', background:'rgba(0,120,255,.85)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer' }}
                            >Send</button>
                        </div>

                        {/* FLOATING ACTION BUTTONS — camera flip, share, slow mode */}
                        <div style={{ position:'absolute', bottom:110, right:16, display:'flex', flexDirection:'column', gap:8, zIndex:15 }}>
                            {/* Camera flip */}
                            <button
                                onClick={e => { e.stopPropagation(); handleFlipCamera(); }}
                                disabled={isCameraFlipping}
                                title="Flip camera"
                                style={{
                                    width:44, height:44, borderRadius:'50%', border:'none',
                                    background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)',
                                    color:'white', fontSize:20, cursor:'pointer', display:'flex',
                                    alignItems:'center', justifyContent:'center',
                                    opacity: isCameraFlipping ? 0.5 : 1,
                                }}
                            >🔄</button>
                            {/* Share */}
                            <button
                                onClick={e => { e.stopPropagation(); handleShare(); }}
                                title="Share stream link"
                                style={{
                                    width:44, height:44, borderRadius:'50%', border:'none',
                                    background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)',
                                    color:'white', fontSize:20, cursor:'pointer', display:'flex',
                                    alignItems:'center', justifyContent:'center',
                                }}
                            >🔗</button>
                            {/* Slow mode */}
                            <button
                                onClick={e => { e.stopPropagation(); handleToggleSlowMode(); }}
                                title={slowMode ? 'Disable slow mode' : 'Enable slow mode'}
                                style={{
                                    width:44, height:44, borderRadius:'50%', border:'none',
                                    background: slowMode ? 'rgba(255,165,0,0.7)' : 'rgba(0,0,0,0.6)',
                                    backdropFilter:'blur(8px)',
                                    color:'white', fontSize:18, cursor:'pointer', display:'flex',
                                    alignItems:'center', justifyContent:'center',
                                }}
                            >🐢</button>
                        </div>

                        {/* TAP-TO-REVEAL: End Stream — only visible when showControls */}
                        {showControls && (
                            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:20, animation:'slideUp .2s ease-out' }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleEndStream(); }}
                                    style={{ background:'rgba(255,255,255,.92)', color:C.red, border:'none', padding:'15px 36px', borderRadius:32, fontSize:17, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 24px rgba(0,0,0,.4)', letterSpacing:.5 }}
                                >
                                    End Stream
                                </button>
                                <div style={{ textAlign:'center', marginTop:10, color:'rgba(255,255,255,.6)', fontSize:12 }}>Tap anywhere to hide</div>
                            </div>
                        )}

                        {/* Link copied flash */}
                        {error && error.includes('clipboard') && (
                            <div style={{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', background:'rgba(0,200,100,0.9)', color:'white', padding:'8px 20px', borderRadius:20, fontSize:13, fontWeight:600, zIndex:30 }}>
                                {error}
                            </div>
                        )}
                    </div>
                )}

                {/* Setup / permission error */}
                {stage === 'setup' && (
                    <div style={{ padding:40, textAlign:'center' }}>
                        <div style={{ fontSize:48, marginBottom:20 }}>📹</div>
                        <h3 style={{ margin:'0 0 12px', color:C.text }}>Camera Access Required</h3>
                        <p style={{ color:C.textSec, margin:'0 0 20px', fontSize:14 }}>Allow camera and microphone to go live.</p>
                        {error && <div style={{ color:C.red, marginBottom:16, fontSize:14 }}>⚠️ {error}</div>}
                        <button onClick={requestMediaAccess} style={{ background:C.red, color:'white', border:'none', padding:'12px 28px', borderRadius:8, fontSize:16, fontWeight:700, cursor:'pointer' }}>
                            Allow Camera Access
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Schedule Modal */}
        {showSchedule && (
            <ScheduleLiveModal
                isOpen={showSchedule}
                onClose={(scheduled) => {
                    setShowSchedule(false);
                }}
                user={user}
            />
        )}
        </>
    );
}

export default GoLiveModal;
