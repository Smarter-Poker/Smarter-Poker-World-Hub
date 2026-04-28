/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM VIEWER — Full-screen viewing experience for live streams
   TikTok/SmarterPoker Live style immersive viewer with chat overlay
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect, useCallback } from 'react';
import { liveStreamService } from '../../services/LiveStreamService';
import { supabase } from '../../lib/supabase';
import { busEmit } from '../../engine/EventBus';

const C = {
    red: '#FA383E',
};

export function LiveStreamViewer({ stream, userId, user, onClose }) {
    const [remoteStream, setRemoteStream] = useState(null);
    const [viewerCount, setViewerCount] = useState(stream?.viewer_count || 0);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState('');
    const [comments, setComments] = useState([]);
    const [commentInput, setCommentInput] = useState('');

    const videoRef = useRef(null);
    const commentsEndRef = useRef(null);
    const commentChannelRef = useRef(null);

    useEffect(() => {
        if (!stream?.id || !userId) return;

        const connect = async () => {
            try {
                setIsConnecting(true);

                // Set up stream ended callback
                liveStreamService.onStreamEnded = () => {
                    setError('Stream has ended');
                    setTimeout(onClose, 2000);
                };

                // Set up viewer count callback
                liveStreamService.onViewerCountChange = (count) => {
                    setViewerCount(count);
                };

                // Join the stream
                await liveStreamService.joinStream(stream.id, userId, (remoteMediaStream) => {
                    setRemoteStream(remoteMediaStream);
                    if (videoRef.current) {
                        videoRef.current.srcObject = remoteMediaStream;
                    }
                    setIsConnecting(false);
                });

                // Notify other components that we joined a stream
                busEmit.dataMutated?.('live_streams');

            } catch (err) {
                console.warn('Failed to join stream:', err);
                setError(err.message || 'Failed to connect to stream');
                setIsConnecting(false);
            }
        };

        connect();

        // Subscribe to live comments realtime
        if (stream?.id) {
            // Load existing comments
            supabase.from('live_comments').select('*').eq('stream_id', stream.id)
                .order('created_at', { ascending: true }).limit(50)
                .then(({ data }) => { if (data) setComments(data); });

            const ch = supabase.channel(`live-comments-${stream.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `stream_id=eq.${stream.id}` },
                    (payload) => { setComments(prev => [...prev, payload.new]); }
                ).subscribe();
            commentChannelRef.current = ch;
        }

        return () => {
            liveStreamService.leaveStream();
            if (commentChannelRef.current) supabase.removeChannel(commentChannelRef.current);
        };
    }, [stream?.id, userId]);

    // Update video element when remote stream changes
    useEffect(() => {
        if (videoRef.current && remoteStream) {
            videoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Auto-scroll comments
    useEffect(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [comments]);

    const handleSendComment = async () => {
        const text = commentInput.trim();
        if (!text || !stream?.id || !userId) return;
        setCommentInput('');
        try {
            await supabase.from('live_comments').insert({
                stream_id: stream.id,
                user_id: userId,
                text,
                author_name: user?.name || user?.full_name || user?.username || 'Viewer',
            });
        } catch (err) { console.warn('[LiveStreamViewer] comment failed:', err); }
    };

    const handleLeave = async () => {
        await liveStreamService.leaveStream();
        // Notify other components that we left the stream
        busEmit.dataMutated?.('live_streams');
        onClose();
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: '#000',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {/* Video Container */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: '100%',
                    objectFit: 'contain',
                }}
            />

            {/* Loading/Connecting Overlay */}
            {isConnecting && !error && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        color: 'white',
                    }}
                >
                    <div style={{ fontSize: 40, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>
                        📡
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>Connecting To Stream...</div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        color: 'white',
                        background: 'rgba(0, 0, 0, 0.8)',
                        padding: '24px 40px',
                        borderRadius: 12,
                    }}
                >
                    <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>{error}</div>
                </div>
            )}

            {/* Top Bar */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
                }}
            >
                {/* Close Button */}
                <button
                    onClick={handleLeave}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(10px)',
                        border: 'none',
                        color: 'white',
                        fontSize: 20,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    ✕
                </button>

                {/* Live Badge + Viewer Count */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <div
                        style={{
                            background: C.red,
                            color: 'white',
                            padding: '8px 14px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        🔴 LIVE
                    </div>
                    <div
                        style={{
                            background: 'rgba(0, 0, 0, 0.6)',
                            color: 'white',
                            padding: '8px 14px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        👁️ {viewerCount}
                    </div>
                </div>
            </div>

            {/* Bottom Bar - Broadcaster Info */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '60px 20px 24px',
                    background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
                }}
            >
                {/* Broadcaster */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <img
                        src={stream?.profiles?.avatar_url || '/default-avatar.png'}
                        alt={stream?.profiles?.username}
                        style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>
                            {stream?.profiles?.username || 'Anonymous'}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                            Smarter.Poker
                        </div>
                    </div>
                </div>

                {/* Stream Title */}
                {stream?.title && (
                    <div style={{ color: 'white', fontSize: 15, lineHeight: 1.4 }}>
                        {stream.title}
                    </div>
                )}
            </div>

            {/* COMMENTS OVERLAY */}
            <div style={{ position:'absolute', bottom:80, left:0, width:'min(320px,60vw)', maxHeight:200, overflowY:'auto', padding:'0 12px', scrollbarWidth:'none', zIndex:5 }}>
                {comments.map((c, i) => (
                    <div key={c.id || i} style={{ marginBottom:6, display:'flex', alignItems:'flex-start', gap:6 }}>
                        <span style={{ color:'#00CFFF', fontWeight:700, fontSize:13, whiteSpace:'nowrap' }}>{c.author_name || 'User'}</span>
                        <span style={{ color:'white', fontSize:13, lineHeight:1.4 }}>{c.text}</span>
                    </div>
                ))}
                <div ref={commentsEndRef} />
            </div>

            {/* COMMENT INPUT */}
            <div style={{ position:'absolute', bottom:24, left:12, right:12, zIndex:10, display:'flex', gap:8 }}>
                <input
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter') handleSendComment(); }}
                    placeholder="Say something..."
                    style={{ flex:1, padding:'9px 14px', borderRadius:22, border:'1.5px solid rgba(255,255,255,.3)', background:'rgba(0,0,0,.5)', color:'white', fontSize:14, outline:'none' }}
                />
                <button
                    onClick={handleSendComment}
                    style={{ padding:'9px 16px', borderRadius:22, border:'none', background:'rgba(0,120,255,.85)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer' }}
                >Send</button>
            </div>

            {/* Pulse animation */}
            <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
        </div>
    );
}

export default LiveStreamViewer;
