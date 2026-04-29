/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM VIEWER v2 — Full-screen viewing experience for live streams
   TikTok/SmarterPoker Live style • reactions • diamond gifts • viewer list
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect, useCallback } from 'react';
import { liveStreamService } from '../../services/LiveStreamService';
import { LiveReactions } from './LiveReactions';
import { LiveViewerList } from './LiveViewerList';
import { LiveDiamondGift } from './LiveDiamondGift';
import { supabase } from '../../lib/supabase';
import { busEmit } from '../../engine/EventBus';

const C = {
    red: '#FA383E',
    blue: '#0066FF',
};

export function LiveStreamViewer({ stream, userId, user, onClose }) {
    const [remoteStream, setRemoteStream] = useState(null);
    const [viewerCount, setViewerCount] = useState(stream?.viewer_count || 0);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [error, setError] = useState('');
    const [comments, setComments] = useState([]);
    const [commentInput, setCommentInput] = useState('');
    const [showViewerList, setShowViewerList] = useState(false);
    const [showGifts, setShowGifts] = useState(false);
    const [userDiamondBalance, setUserDiamondBalance] = useState(0);
    const [giftFlash, setGiftFlash] = useState('');

    const videoRef = useRef(null);
    const commentsEndRef = useRef(null);
    const commentChannelRef = useRef(null);

    useEffect(() => {
        if (!stream?.id || !userId) return;

        const connect = async () => {
            try {
                setIsConnecting(true);

                // Set up callbacks
                liveStreamService.onStreamEnded = () => {
                    setError('Stream has ended');
                    setTimeout(onClose, 2000);
                };
                liveStreamService.onViewerCountChange = (count) => setViewerCount(count);
                liveStreamService.onReconnecting = () => setIsReconnecting(true);
                liveStreamService.onReconnected = () => setIsReconnecting(false);

                // Join the stream
                await liveStreamService.joinStream(stream.id, userId, (remoteMediaStream) => {
                    setRemoteStream(remoteMediaStream);
                    if (videoRef.current) {
                        videoRef.current.srcObject = remoteMediaStream;
                    }
                    setIsConnecting(false);
                });

                // Load diamond balance for gift panel
                if (userId) {
                    supabase.from('diamond_balances').select('balance').eq('user_id', userId).maybeSingle()
                        .then(({ data }) => { if (data) setUserDiamondBalance(data.balance || 0); });
                }

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

                {/* Live Badge + Viewer Count (tappable to open viewer list) */}
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
                    <button
                        onClick={() => setShowViewerList(true)}
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
                            border: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        👁️ {viewerCount}
                    </button>
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

            {/* COMMENT INPUT + gift button */}
            <div style={{ position:'absolute', bottom:24, left:12, right:12, zIndex:10, display:'flex', gap:8 }}>
                <input
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter') handleSendComment(); }}
                    placeholder="Say something..."
                    style={{ flex:1, padding:'9px 14px', borderRadius:22, border:'1.5px solid rgba(255,255,255,.3)', background:'rgba(0,0,0,.5)', color:'white', fontSize:14, outline:'none' }}
                />
                {/* Diamond gift button */}
                {stream?.broadcaster_id && stream.broadcaster_id !== userId && (
                    <button
                        onClick={() => setShowGifts(true)}
                        style={{ padding:'9px 12px', borderRadius:22, border:'none', background:'rgba(255,215,0,0.85)', color:'#000', fontSize:16, fontWeight:700, cursor:'pointer' }}
                        title="Send diamond gift"
                    >
                        💎
                    </button>
                )}
                <button
                    onClick={handleSendComment}
                    style={{ padding:'9px 16px', borderRadius:22, border:'none', background:'rgba(0,120,255,.85)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer' }}
                >Send</button>
            </div>

            {/* Emoji reactions */}
            <LiveReactions streamId={stream?.id} userId={userId} />

            {/* Gift panel */}
            {showGifts && (
                <LiveDiamondGift
                    streamId={stream?.id}
                    receiverId={stream?.broadcaster_id}
                    userId={userId}
                    userBalance={userDiamondBalance}
                    onGiftSent={(amount, newBalance) => {
                        setUserDiamondBalance(newBalance);
                        setGiftFlash(`💎 ${amount} diamonds sent!`);
                        setTimeout(() => setGiftFlash(''), 3000);
                    }}
                    onClose={() => setShowGifts(false)}
                />
            )}

            {/* Viewer list */}
            <LiveViewerList
                streamId={stream?.id}
                viewerCount={viewerCount}
                isOpen={showViewerList}
                onClose={() => setShowViewerList(false)}
            />

            {/* Gift flash notification */}
            {giftFlash && (
                <div style={{ position:'absolute', top:80, left:'50%', transform:'translateX(-50%)', background:'rgba(255,215,0,0.9)', color:'#000', padding:'8px 20px', borderRadius:20, fontSize:14, fontWeight:700, zIndex:40 }}>
                    {giftFlash}
                </div>
            )}

            {/* Reconnect overlay */}
            {isReconnecting && (
                <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.7)', zIndex:30, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ width:48, height:48, borderRadius:'50%', border:'4px solid rgba(255,255,255,0.2)', borderTopColor:'#0066FF', animation:'spin 0.8s linear infinite', marginBottom:16 }} />
                    <div style={{ color:'white', fontSize:16, fontWeight:700 }}>Reconnecting...</div>
                </div>
            )}

            {/* Animations */}
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes floatUp { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-200px) scale(1.4); opacity: 0; } }
            `}</style>
        </div>
    );
}

export default LiveStreamViewer;
