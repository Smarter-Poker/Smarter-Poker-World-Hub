/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM VIEWER v3 — Full-screen viewing experience for live streams
   TikTok/SmarterPoker Live style • reactions • diamond gifts • viewer list
   
   v3: slow-mode RPC, gift animations, connection quality, comment pagination,
       real-time diamond balance updates
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

const COMMENTS_PER_PAGE = 50;

export function LiveStreamViewer({ stream, userId, user, onClose }) {
    const [remoteStream, setRemoteStream] = useState(null);
    const [viewerCount, setViewerCount] = useState(stream?.viewer_count || 0);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [connectionQuality, setConnectionQuality] = useState('excellent');
    const [error, setError] = useState('');
    const [commentError, setCommentError] = useState('');
    const [comments, setComments] = useState([]);
    const [commentInput, setCommentInput] = useState('');
    const [showViewerList, setShowViewerList] = useState(false);
    const [showGifts, setShowGifts] = useState(false);
    const [userDiamondBalance, setUserDiamondBalance] = useState(0);
    const [giftFlash, setGiftFlash] = useState(null);
    const [hasMoreComments, setHasMoreComments] = useState(false);
    const [loadingMoreComments, setLoadingMoreComments] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false); // #7: follow broadcaster
    const [followLoading, setFollowLoading] = useState(false);
    const [pinnedComment, setPinnedComment] = useState(null); // #18: pinned comment from broadcaster

    const videoRef = useRef(null);
    const commentsEndRef = useRef(null);
    const commentChannelRef = useRef(null);
    const giftChannelRef = useRef(null);
    const commentInputRef = useRef(null); // #10: blur after send to dismiss keyboard
    const pinChannelRef = useRef(null); // #18: pinned comment subscription

    useEffect(() => {
        if (!stream?.id || !userId) return;
        let hasLeft = false;

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
                liveStreamService.onConnectionQualityChange = (q) => setConnectionQuality(q);

                // Join the stream
                await liveStreamService.joinStream(stream.id, userId, (remoteMediaStream) => {
                    setRemoteStream(remoteMediaStream);
                    if (videoRef.current) {
                        videoRef.current.srcObject = remoteMediaStream;
                    }
                    setIsConnecting(false);
                });

                setIsConnecting(false);

                // Load diamond balance for gift panel
                if (userId) {
                    supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle()
                        .then(({ data }) => { if (data) setUserDiamondBalance(data.diamonds || 0); });
                }

                busEmit.dataMutated?.('live_streams');

            } catch (err) {
                console.warn('Failed to join stream:', err);
                setError(err.message || 'Failed to connect to stream');
                setIsConnecting(false);
            }
        };

        connect();

        // #7: Check follow status
        if (userId && stream?.broadcaster_id && userId !== stream.broadcaster_id) {
            supabase.from('social_follows')
                .select('id')
                .eq('follower_id', userId)
                .eq('following_id', stream.broadcaster_id)
                .maybeSingle()
                .then(({ data }) => setIsFollowing(!!data));
        }

        // Subscribe to live comments realtime
        if (stream?.id) {
            supabase.from('live_comments').select('*').eq('stream_id', stream.id)
                .order('created_at', { ascending: false }).limit(COMMENTS_PER_PAGE)
                .then(({ data }) => {
                    if (data) {
                        const reversed = data.reverse();
                        setComments(reversed);
                        setHasMoreComments(data.length === COMMENTS_PER_PAGE);
                    }
                });

            // Remove any existing channel before creating new one
            if (commentChannelRef.current) {
                supabase.removeChannel(commentChannelRef.current);
                commentChannelRef.current = null;
            }
            const ch = supabase.channel(`live-comments-${stream.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `stream_id=eq.${stream.id}` },
                    (payload) => { setComments(prev => [...prev, payload.new]); }
                ).subscribe();
            commentChannelRef.current = ch;
        }

        // Subscribe to gift broadcast events for animations
        if (stream?.id) {
            // FIX: channel name must match what gift.js API broadcasts to
            const giftCh = supabase.channel(`live-gifts-${stream.id}`, {
                config: { broadcast: { self: false } },
            });
            giftCh.on('broadcast', { event: 'gift' }, ({ payload }) => {
                if (payload?.sender_name && payload?.amount) {
                    setGiftFlash({ name: payload.sender_name, amount: payload.amount, avatar: payload.sender_avatar });
                    setTimeout(() => setGiftFlash(null), 4000);
                }
            }).subscribe();
            giftChannelRef.current = giftCh;
        }

        // #18: Subscribe to pinned comments
        if (stream?.id) {
            const pinCh = supabase.channel(`live-pins-${stream.id}`)
                .on('postgres_changes', {
                    event: 'INSERT', schema: 'public', table: 'live_pins',
                    filter: `stream_id=eq.${stream.id}`,
                }, async (payload) => {
                    if (payload.new?.comment_id) {
                        const { data: comment } = await supabase.from('live_comments')
                            .select('*').eq('id', payload.new.comment_id).maybeSingle();
                        if (comment) setPinnedComment(comment);
                    }
                })
                .subscribe();
            pinChannelRef.current = pinCh;

            // Also fetch existing pinned comment
            supabase.from('live_pins')
                .select('comment_id').eq('stream_id', stream.id)
                .order('created_at', { ascending: false }).limit(1).maybeSingle()
                .then(async ({ data: pin }) => {
                    if (pin?.comment_id) {
                        const { data: comment } = await supabase.from('live_comments')
                            .select('*').eq('id', pin.comment_id).maybeSingle();
                        if (comment) setPinnedComment(comment);
                    }
                });
        }

        return () => {
            if (!hasLeft) {
                hasLeft = true;
                liveStreamService.leaveStream();
            }
            if (commentChannelRef.current) supabase.removeChannel(commentChannelRef.current);
            if (giftChannelRef.current) supabase.removeChannel(giftChannelRef.current);
            if (pinChannelRef.current) supabase.removeChannel(pinChannelRef.current);
            liveStreamService.onStreamEnded = null;
            liveStreamService.onViewerCountChange = null;
            liveStreamService.onReconnecting = null;
            liveStreamService.onReconnected = null;
            liveStreamService.onConnectionQualityChange = null;
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

    /** Load earlier comments (pagination) */
    const loadMoreComments = async () => {
        if (!stream?.id || loadingMoreComments || !hasMoreComments) return;
        setLoadingMoreComments(true);
        try {
            const oldest = comments[0];
            const { data } = await supabase.from('live_comments')
                .select('*')
                .eq('stream_id', stream.id)
                .lt('created_at', oldest?.created_at || new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(COMMENTS_PER_PAGE);
            if (data) {
                const reversed = data.reverse();
                setComments(prev => [...reversed, ...prev]);
                setHasMoreComments(data.length === COMMENTS_PER_PAGE);
            }
        } catch (err) { console.warn('[Viewer] loadMore comments error:', err); }
        setLoadingMoreComments(false);
    };

    /** Send comment via slow-mode RPC */
    const handleSendComment = async () => {
        const text = commentInput.trim();
        if (!text || !stream?.id || !userId) return;
        setCommentInput('');
        setCommentError('');
        commentInputRef.current?.blur(); // #10: dismiss mobile keyboard
        const authorName = user?.full_name || user?.user_metadata?.full_name || user?.username || user?.email?.split('@')[0] || 'Viewer';
        try {
            const { data, error } = await supabase.rpc('insert_live_comment_with_slowmode', {
                p_stream_id: stream.id,
                p_user_id: userId,
                p_text: text,
                p_author_name: authorName,
            });
            if (error) {
                setCommentError(error.message || 'Comment failed');
                setTimeout(() => setCommentError(''), 3000);
            } else if (data && !data.success) {
                setCommentError(data.error);
                setTimeout(() => setCommentError(''), 3000);
            }
        } catch (err) { console.warn('[LiveStreamViewer] comment failed:', err); }
    };

    const handleLeave = async () => {
        liveStreamService.isManualDisconnect = true;
        await liveStreamService.leaveStream();
        busEmit.dataMutated?.('live_streams');
        onClose();
    };

    const qualityColor = connectionQuality === 'excellent' || connectionQuality === 'good'
        ? '#42B72A' : connectionQuality === 'poor' ? '#FFA500' : '#FA383E';

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
                    <div style={{ width:48, height:48, borderRadius:'50%', border:'4px solid rgba(255,255,255,0.2)', borderTopColor:'#0066FF', animation:'spin 0.8s linear infinite', marginBottom:16, marginLeft:'auto', marginRight:'auto' }} />
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
                    <div style={{ fontSize: 18, fontWeight: 500 }}>{error}</div>
                </div>
            )}

            {/* Gift flash animation — visible to ALL viewers */}
            {giftFlash && (
                <div style={{
                    position:'absolute', top:'30%', left:'50%', transform:'translate(-50%,-50%)',
                    zIndex:45, animation:'giftPop 0.5s ease-out',
                    textAlign:'center', pointerEvents:'none',
                }}>
                    <div style={{ fontSize:56, marginBottom:8 }}>💎</div>
                    <div style={{ color:'white', fontSize:22, fontWeight:800, textShadow:'0 2px 16px rgba(0,0,0,.9)' }}>
                        {giftFlash.name} sent {giftFlash.amount} diamonds!
                    </div>
                </div>
            )}

            {/* Top Bar */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: 'max(16px, env(safe-area-inset-top, 16px)) 20px 16px',
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

                {/* Live Badge + Connection Quality + Viewer Count */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                        <span style={{ width:8, height:8, borderRadius:'50%', background:'white', display:'inline-block' }} />
                        LIVE
                    </div>
                    {/* Connection quality dot */}
                    <div
                        title={`Connection: ${connectionQuality}`}
                        style={{
                            width:12, height:12, borderRadius:'50%',
                            background: qualityColor,
                            boxShadow: `0 0 6px ${qualityColor}`,
                        }}
                    />
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        {viewerCount}
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
                    padding: '60px 20px max(24px, calc(env(safe-area-inset-bottom, 0px) + 80px))',
                    background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
                }}
            >
                {/* Broadcaster */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <img
                        src={stream?.broadcaster?.avatar_url || stream?.profiles?.avatar_url || '/default-avatar.png'}
                        alt={stream?.broadcaster?.username || stream?.profiles?.username}
                        style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>
                            {stream?.broadcaster?.username || stream?.profiles?.username || 'Anonymous'}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                            {stream?.category && stream.category !== 'general'
                                ? stream.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                                : 'Smarter.Poker'}
                        </div>
                    </div>
                    {/* #7: Follow button */}
                    {userId && stream?.broadcaster_id && userId !== stream.broadcaster_id && (
                        <button
                            onClick={async () => {
                                if (followLoading) return;
                                setFollowLoading(true);
                                try {
                                    if (isFollowing) {
                                        await supabase.from('social_follows')
                                            .delete()
                                            .eq('follower_id', userId)
                                            .eq('following_id', stream.broadcaster_id);
                                        setIsFollowing(false);
                                    } else {
                                        await supabase.from('social_follows')
                                            .upsert(
                                                { follower_id: userId, following_id: stream.broadcaster_id },
                                                { onConflict: 'follower_id,following_id' }
                                            );
                                        setIsFollowing(true);
                                    }
                                } catch (e) { console.warn('Follow error:', e); }
                                setFollowLoading(false);
                            }}
                            style={{
                                padding: '6px 16px',
                                borderRadius: 20,
                                border: isFollowing ? '1px solid rgba(255,255,255,0.4)' : 'none',
                                background: isFollowing ? 'transparent' : C.red,
                                color: 'white',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                flexShrink: 0,
                            }}
                        >
                            {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
                        </button>
                    )}
                </div>

                {/* Stream Title */}
                {stream?.title && (
                    <div style={{ color: 'white', fontSize: 15, lineHeight: 1.4 }}>
                        {stream.title}
                    </div>
                )}
                {/* #9: Stream description */}
                {stream?.description && (
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.3, marginTop: 4 }}>
                        {stream.description}
                    </div>
                )}
            </div>

            {/* #18: PINNED COMMENT (viewer side) */}
            {pinnedComment && (
                <div style={{ position:'absolute', bottom:290, left:12, right:80, zIndex:10, background:'rgba(0,0,0,0.7)', borderRadius:10, padding:'8px 12px', border:'1px solid rgba(255,215,0,0.3)' }}>
                    <div style={{ color:'#FFD700', fontSize:11, fontWeight:700, marginBottom:4 }}>PINNED</div>
                    <span style={{ color:'#00CFFF', fontWeight:700, fontSize:12, marginRight:6 }}>{pinnedComment.author_name || 'User'}</span>
                    <span style={{ color:'white', fontSize:12 }}>{pinnedComment.text}</span>
                </div>
            )}

            {/* COMMENTS OVERLAY */}
            <div style={{ position:'absolute', bottom:80, left:0, width:'min(320px,60vw)', maxHeight:200, overflowY:'auto', padding:'0 12px', scrollbarWidth:'none', zIndex:5 }}>
                {/* Load more comments button */}
                {hasMoreComments && (
                    <button
                        onClick={loadMoreComments}
                        disabled={loadingMoreComments}
                        style={{
                            display:'block', width:'100%', padding:'6px', marginBottom:8,
                            background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8,
                            color:'rgba(255,255,255,0.6)', fontSize:12, cursor:'pointer',
                        }}
                    >
                        {loadingMoreComments ? 'Loading...' : 'Load Earlier Comments'}
                    </button>
                )}
                {comments.map((c, i) => (
                    <div key={c.id || i} style={{ marginBottom:6, display:'flex', alignItems:'flex-start', gap:6 }}>
                        <span style={{ color:'#00CFFF', fontWeight:700, fontSize:13, whiteSpace:'nowrap' }}>{c.author_name || 'User'}</span>
                        <span style={{ color:'white', fontSize:13, lineHeight:1.4 }}>{c.text}</span>
                    </div>
                ))}
                <div ref={commentsEndRef} />
            </div>

            {/* Slow mode / ban error */}
            {commentError && (
                <div style={{
                    position:'absolute', bottom:65, left:12, right:12,
                    background:'rgba(250,56,62,0.9)', color:'white',
                    padding:'6px 14px', borderRadius:8, fontSize:13, fontWeight:600, zIndex:15,
                }}>
                    {commentError}
                </div>
            )}

            {/* COMMENT INPUT + gift button */}
            <div style={{ position:'absolute', bottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 24px))', left:12, right:12, zIndex:10, display:'flex', gap:8 }}>
                <input
                    ref={commentInputRef}
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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
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
                        // Local gift flash for sender
                        setGiftFlash({ name: 'You', amount });
                        setTimeout(() => setGiftFlash(null), 3000);
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
                @keyframes giftPop { 0% { transform: translate(-50%,-50%) scale(0.5); opacity: 0; } 60% { transform: translate(-50%,-50%) scale(1.15); } 100% { transform: translate(-50%,-50%) scale(1); opacity: 1; } }
            `}</style>
        </div>
    );
}

export default LiveStreamViewer;
