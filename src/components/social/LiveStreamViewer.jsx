/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM VIEWER v3 — Full-screen viewing experience for live streams
   TikTok/SmarterPoker Live style • reactions • diamond gifts • viewer list
   
   v3: slow-mode RPC, gift animations, connection quality, comment pagination,
       real-time diamond balance updates
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { liveStreamService } from '../../services/LiveStreamService';
import { LiveReactions } from './LiveReactions';
import { LiveViewerList } from './LiveViewerList';
import { LiveDiamondGift } from './LiveDiamondGift';
import { supabase } from '../../lib/supabase';
import { busEmit } from '../../engine/EventBus';
import { getAccessToken } from '../../lib/authUtils';
import Lottie from 'lottie-react';
import diamondAnimation from '../../../public/diamond-animation.json';
import useStreamingViewportLock from '../../lib/useStreamingViewportLock';

const C = {
    red: '#FA383E',
    blue: '#0066FF',
};

const COMMENTS_PER_PAGE = 50;

export function LiveStreamViewer({ stream, userId, user, onClose }) {
    // BUG-FIX-LIVE-7+8 (viewer side): same viewport hardening as the
    // broadcaster modal — locks meta tag to maximum-scale=1, listens for
    // orientation/visualViewport events, forces reflow on layout change so
    // an accidental pinch or rotation doesn't permanently break the viewer.
    useStreamingViewportLock(true);

    // streamData starts as the prop but gets replaced with full DB data from joinStream
    // which includes the broadcaster:profiles join. The prop may be partial (e.g. from Stories.loadLiveUsers).
    const [streamData, setStreamData] = useState(stream);
    const [remoteStream, setRemoteStream] = useState(null);
    const pendingStreamRef = useRef(null); // BUG FIX (LSV-1): hold stream until video element is mounted
    // BUG-FIX-LIVE-AUDIT (B4): Set<uuid> of user_ids the viewer has blocked
    // OR who have blocked the viewer. Used by the realtime comment INSERT
    // handler to drop comments from those users in real time. Initial-load
    // and pagination paths use the get_visible_live_comments RPC instead.
    const blockedSetRef = useRef(new Set());
    const [viewerCount, setViewerCount] = useState(stream?.viewer_count || 0);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [connectionQuality, setConnectionQuality] = useState('excellent');
    const [error, setError] = useState('');
    const [commentError, setCommentError] = useState('');
    const [comments, setComments] = useState([]);
    const [isTheaterMode, setIsTheaterMode] = useState(false);
    const [isPiP, setIsPiP] = useState(false);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    // BUG-FIX-THEATER: sync isTheaterMode when user exits fullscreen via browser chrome
    // Without this, ✕ gets stuck and calling exitFullscreen() on a non-fullscreen doc throws
    const [shareToast, setShareToast] = useState('');
    const shareToastTimerRef = useRef(null);
    // BUG-FIX-LIVE-7: track currently-selected video tier so the menu shows a
    // checkmark + the trigger button labels the active selection ("Quality · low").
    const [activeQuality, setActiveQuality] = useState('auto');
    const [commentInput, setCommentInput] = useState('');
    const [showViewerList, setShowViewerList] = useState(false);
    const [showGifts, setShowGifts] = useState(false);
    const [userDiamondBalance, setUserDiamondBalance] = useState(0);
    const [giftFlash, setGiftFlash] = useState(null);
    const [topGifters, setTopGifters] = useState({}); // Feature 5: Top Supporters
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
    // Feature 3: Clip It
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]); // BUG FIX: was missing, caused "recordedChunksRef is not defined" crash
    const [isClipping, setIsClipping] = useState(false);
    const [participants, setParticipants] = useState([]); // FEATURE 6: Split-screen state
    // BUG FIX (L7): track the active giftFlash timer so a new gift arrival
    // cancels the previous one instead of racing to clear the display.
    const giftFlashTimerRef = useRef(null);
    // BUG FIX (LV-1): track commentError clear timer to cancel on unmount
    const commentErrorTimerRef = useRef(null);
    // BUG FIX (V5): track the onStreamEnded close timer so unmount can cancel it
    const streamEndedTimerRef = useRef(null);

    useEffect(() => {
        if (!stream?.id || !userId) return;

        // BUG-FIX-LIVE-AUDIT (B4): pre-fetch the set of user_ids the viewer
        // has blocked OR who have blocked the viewer. Used by the realtime
        // comment INSERT handler to drop hostile comments before they
        // appear. Cheap one-shot read on mount; the set is small in practice.
        (async () => {
            try {
                const [outBlocks, inBlocks] = await Promise.all([
                    supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
                    supabase.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
                ]);
                const set = new Set();
                (outBlocks.data || []).forEach(r => r.blocked_id && set.add(r.blocked_id));
                (inBlocks.data || []).forEach(r => r.blocker_id && set.add(r.blocker_id));
                blockedSetRef.current = set;
            } catch (err) {
                console.warn('[Viewer] block-set prefetch failed:', err?.message || err);
            }
        })();

        // Fetch historical gifts for leaderboard
        fetch(`/api/live/gifts?stream_id=${stream.id}`)
            .then(res => res.json())
            .then(data => {
                if (data.topGifters) {
                    setTopGifters(data.topGifters);
                }
            })
            .catch(err => console.error('Failed to load gifts', err));

        const connect = async () => {
            try {
                setIsConnecting(true);

                // Set up callbacks
                liveStreamService.onStreamEnded = () => {
                    setError('Stream has ended');
                    // BUG FIX (V5): store timer ref so unmount can cancel it
                    streamEndedTimerRef.current = setTimeout(() => {
                        streamEndedTimerRef.current = null;
                        onClose();
                    }, 2000);
                };
                liveStreamService.onViewerCountChange = (count) => setViewerCount(count);
                liveStreamService.onReconnecting = () => setIsReconnecting(true);
                liveStreamService.onReconnected = () => setIsReconnecting(false);
                liveStreamService.onConnectionQualityChange = (q) => setConnectionQuality(q);
                liveStreamService.onParticipantsUpdate = (ps) => setParticipants(ps); // FEATURE 6

                // Join the stream — joinStream returns the full DB row with broadcaster join
                const freshStream = await liveStreamService.joinStream(stream.id, userId, (remoteMediaStream) => {
                    // BUG FIX (LSV-1): store in ref first, then state. The video element
                    // may not be in the DOM yet when this callback fires (if the connecting
                    // overlay is still showing). The useEffect below assigns srcObject after
                    // the video element is guaranteed to be present.
                    pendingStreamRef.current = remoteMediaStream;
                    setRemoteStream(remoteMediaStream);
                    setIsConnecting(false);
                });

                // BUG FIX (V-VIDEO-1): force-reassign srcObject when a video track
                // arrives AFTER the initial onRemoteStream delivery (audio arrived first).
                // Mobile browsers don't render dynamically-added video tracks on an
                // already-assigned srcObject.
                liveStreamService.onTrackAdded = (mediaStream, kind) => {
                    if (kind === 'video' && videoRef.current) {
                        // Force browser to re-evaluate tracks by re-assigning srcObject
                        videoRef.current.srcObject = null;
                        videoRef.current.srcObject = mediaStream;
                        videoRef.current.play().catch(() => {});
                    }
                };
                // Update streamData with the full DB response (includes broadcaster profile)
                if (freshStream) setStreamData(freshStream);

                // Don't set isConnecting false here — let the remoteStream callback do it
                // so we don't show a blank video before the track is ready.

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
                .then(({ data }) => setIsFollowing(!!data))
                .catch(() => {});
        }

        // Subscribe to live comments realtime
        if (stream?.id) {
            // BUG-FIX-LIVE-AUDIT (B4): use the get_visible_live_comments RPC
            // which filters out comments from users the caller has blocked
            // OR who have blocked the caller. The realtime INSERT subscription
            // below is also block-filtered client-side via the same logic in
            // payload handler since postgres_changes can't filter on JOIN.
            supabase.rpc('get_visible_live_comments', {
                p_stream_id: stream.id,
                p_limit: COMMENTS_PER_PAGE,
                p_before: null,
            })
                .then(({ data, error }) => {
                    if (error) {
                        // RPC missing (dev/older env) — fall back to unfiltered SELECT
                        if (error.code === 'PGRST202' || error.message?.includes('not exist')) {
                            return supabase.from('live_comments').select('*')
                                .eq('stream_id', stream.id)
                                .order('created_at', { ascending: false })
                                .limit(COMMENTS_PER_PAGE);
                        }
                        return { data: [] };
                    }
                    return { data };
                })
                .then((res) => {
                    const data = res?.data;
                    if (data) {
                        const reversed = data.slice().reverse();
                        setComments(reversed);
                        setHasMoreComments(data.length === COMMENTS_PER_PAGE);
                    }
                });

            // Remove any existing channel before creating new one
            if (commentChannelRef.current) {
                supabase.removeChannel(commentChannelRef.current);
                commentChannelRef.current = null;
            }
            const ch = supabase.channel(`live-comments-viewer-${stream.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `stream_id=eq.${stream.id}` },
                    (payload) => {
                        // BUG-FIX-LIVE-AUDIT (B4): drop comments from users
                        // the viewer has blocked or who have blocked the
                        // viewer. The set is populated on mount and refreshed
                        // implicitly when the viewer leaves and re-joins —
                        // an acceptable lag for a moderation feature.
                        if (blockedSetRef.current?.has(payload.new.user_id)) return;

                        // BUG FIX (LSV-2): Only deduplicate against optimistic comments,
                        // not ALL comments from this user. The optimistic comment has an id
                        // starting with 'optimistic-'. If there's a matching optimistic entry,
                        // replace it (already done in handleSendComment). Otherwise, add it.
                        setComments(prev => {
                            // BUG FIX (LSV-5): Deduplicate by exact DB ID. If handleSendComment API
                            // responded first, the exact row is already here. Don't add it twice.
                            if (prev.some(c => c.id === payload.new.id)) return prev;

                            const hasOptimistic = prev.some(c => c.id?.toString().startsWith('optimistic-') && c.user_id === payload.new.user_id && c.text === payload.new.text);
                            if (hasOptimistic) {
                                // Replace the optimistic placeholder with the real DB row
                                return prev.map(c =>
                                    (c.id?.toString().startsWith('optimistic-') && c.user_id === payload.new.user_id && c.text === payload.new.text)
                                        ? payload.new : c
                                );
                            }
                            return [...prev, payload.new];
                        });
                    }
                )
                // BUG FIX (LSV-6): Handle DELETE events — broadcaster deletes propagate to
                // all viewer screens. Previously, deleted comments were permanently visible.
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_comments', filter: `stream_id=eq.${stream.id}` },
                    (payload) => {
                        setComments(prev => prev.filter(c => c.id !== payload.old.id));
                    }
                )
                .subscribe();
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
                    // BUG FIX (L7): cancel the previous flash timer before starting a new one.
                    // Without this, rapid gifts cause the first timer to clear the second gift.
                    if (giftFlashTimerRef.current) clearTimeout(giftFlashTimerRef.current);
                    setGiftFlash({ name: payload.sender_name, amount: payload.amount, avatar: payload.sender_avatar });
                    giftFlashTimerRef.current = setTimeout(() => {
                        giftFlashTimerRef.current = null;
                        setGiftFlash(null);
                    }, 4000);

                    // Feature 5: Update Top Gifters Leaderboard
                    setTopGifters(prev => {
                        const currentAmount = prev[payload.sender_name] || 0;
                        return { ...prev, [payload.sender_name]: currentAmount + payload.amount };
                    });
                }
            }).subscribe();
            giftChannelRef.current = giftCh;
        }

        // #18: Subscribe to pinned comments
        if (stream?.id) {
            const pinCh = supabase.channel(`live-pins-${stream.id}`)
                .on('postgres_changes', {
                    event: '*', schema: 'public', table: 'live_pins',
                    filter: `stream_id=eq.${stream.id}`,
                }, async (payload) => {
                    if (payload.eventType === 'DELETE') {
                        setPinnedComment(null);
                        return;
                    }
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
            if (commentChannelRef.current) supabase.removeChannel(commentChannelRef.current);
            if (giftChannelRef.current) supabase.removeChannel(giftChannelRef.current);
            if (pinChannelRef.current) supabase.removeChannel(pinChannelRef.current);
            // BUG FIX (L7): cancel any pending giftFlash timer on unmount
            if (giftFlashTimerRef.current) clearTimeout(giftFlashTimerRef.current);
            // BUG FIX (LV-1): cancel any pending commentError clear timer on unmount
            if (commentErrorTimerRef.current) clearTimeout(commentErrorTimerRef.current);
            // BUG FIX (V5): cancel onStreamEnded close timer on unmount
            if (streamEndedTimerRef.current) clearTimeout(streamEndedTimerRef.current);
            liveStreamService.onStreamEnded = null;
            liveStreamService.onViewerCountChange = null;
            liveStreamService.onReconnecting = null;
            liveStreamService.onReconnected = null;
            liveStreamService.onConnectionQualityChange = null;
            liveStreamService.onTrackAdded = null;
        };
    }, [stream?.id, userId]);

    // Host video binding from LiveKit participants
    useEffect(() => {
        if (!videoRef.current || !stream?.broadcaster_id) return;
        const hostParticipant = participants.find(p => String(p.identity) === String(stream.broadcaster_id));
        if (hostParticipant) {
            const pubs = Array.from(hostParticipant.videoTrackPublications.values());
            const videoPub = pubs.find(pub => pub.track);
            if (videoPub?.track) {
                try {
                    videoPub.track.attach(videoRef.current);
                } catch(e) {}
            }
        }
    }, [participants, stream?.broadcaster_id]);


    // BUG FIX (LSV-1): Assign srcObject after both the video element AND the stream are ready.
    // We use the pendingStreamRef so we never miss a stream that arrived before the video mounted.
    useEffect(() => {
        if (videoRef.current && remoteStream) {
            videoRef.current.srcObject = remoteStream;
            videoRef.current.play().catch(() => {});
            pendingStreamRef.current = null;
        }
    }, [remoteStream]);

    // Secondary guard: after isConnecting goes false, force-assign if pending stream exists
    useEffect(() => {
        if (!isConnecting && pendingStreamRef.current && videoRef.current) {
            videoRef.current.srcObject = pendingStreamRef.current;
            videoRef.current.play().catch(() => {});
            
            // Feature 3: Start background recording for Clip It (last 60s)
            try {
                recordedChunksRef.current = [];
                const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
                const mr = new MediaRecorder(pendingStreamRef.current, { mimeType: mime });
                mr.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        recordedChunksRef.current.push(e.data);
                        // Keep only approx last 60 chunks (assuming 1 chunk per second)
                        if (recordedChunksRef.current.length > 60) {
                            recordedChunksRef.current.shift();
                        }
                    }
                };
                mr.start(1000); // 1 second chunks
                mediaRecorderRef.current = mr;
            } catch (err) {
                console.warn('[ClipIt] Failed to start MediaRecorder:', err);
            }

            pendingStreamRef.current = null;
        }
    }, [isConnecting]);

    // Cleanup MediaRecorder on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    // Feature 3: Handle Clip It
    const handleClipIt = async () => {
        if (!mediaRecorderRef.current || recordedChunksRef.current.length === 0 || isClipping) return;
        setIsClipping(true);
        try {
            const blob = new Blob(recordedChunksRef.current, { type: mediaRecorderRef.current.mimeType });
            const ext = mediaRecorderRef.current.mimeType.includes('mp4') ? 'mp4' : 'webm';
            const path = `clips/${userId}/${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('live-recordings')
                .upload(path, blob, { contentType: blob.type });
            
            if (uploadErr) throw uploadErr;
            
            const { data } = supabase.storage.from('live-recordings').getPublicUrl(path);
            
            // Draft social feed post (pass via URL or event bus)
            const draftUrl = `/hub/social-media?clipUrl=${encodeURIComponent(data.publicUrl)}&title=${encodeURIComponent(`Clipped from ${streamData?.broadcaster?.username || 'Live Stream'}`)}`;
            window.open(draftUrl, '_blank');
        } catch (err) {
            console.error('Clip It Error:', err);
            alert('Failed to create clip.');
        } finally {
            setIsClipping(false);
        }
    };

    // Feature 1: PiP Mode Handler
    const togglePiP = async () => {
        if (!videoRef.current) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                setIsPiP(false);
            } else if (document.pictureInPictureEnabled) {
                await videoRef.current.requestPictureInPicture();
                setIsPiP(true);
            }
        } catch (err) {
            console.warn('[PiP] Error:', err);
        }
    };

    // BUG FIX (PiP-1): Keep isPiP state in sync when user closes PiP via browser native UI
    useEffect(() => {
        const onLeave = () => setIsPiP(false);
        const onEnter = () => setIsPiP(true);
        document.addEventListener('leavepictureinpicture', onLeave);
        document.addEventListener('enterpictureinpicture', onEnter);
        // BUG-FIX-THEATER: sync isTheaterMode when user exits fullscreen via browser chrome ✕
        // or back button. Without this, clicking Theater again calls exitFullscreen() on
        // a null fullscreenElement which throws and permanently freezes the stream.
        const onFullscreenChange = () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                setIsTheaterMode(false);
            } else {
                setIsTheaterMode(true);
            }
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        return () => {
            document.removeEventListener('leavepictureinpicture', onLeave);
            document.removeEventListener('enterpictureinpicture', onEnter);
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
            if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
        };
    }, []);

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
            // BUG-FIX-LIVE-AUDIT (B4): use the block-filtering RPC for pagination
            // too. Pass p_before so we get older comments than what's loaded.
            const { data, error } = await supabase.rpc('get_visible_live_comments', {
                p_stream_id: stream.id,
                p_limit: COMMENTS_PER_PAGE,
                p_before: oldest?.created_at || new Date().toISOString(),
            });
            let rows = data;
            if (error) {
                if (error.code === 'PGRST202' || error.message?.includes('not exist')) {
                    // Fallback when RPC is missing
                    const fb = await supabase.from('live_comments')
                        .select('*')
                        .eq('stream_id', stream.id)
                        .lt('created_at', oldest?.created_at || new Date().toISOString())
                        .order('created_at', { ascending: false })
                        .limit(COMMENTS_PER_PAGE);
                    rows = fb.data;
                } else {
                    throw error;
                }
            }
            if (rows) {
                const reversed = rows.slice().reverse();
                setComments(prev => [...reversed, ...prev]);
                setHasMoreComments(rows.length === COMMENTS_PER_PAGE);
            }
        } catch (err) { console.warn('[Viewer] loadMore comments error:', err); }
        setLoadingMoreComments(false);
    };

    /** Send comment — via server API (resolves author_name from profiles server-side
     *  to eliminate client-spoofing). Optimistic update for instant UX. */
    const handleSendComment = async () => {
        const text = commentInput.trim();
        if (!text || !stream?.id || !userId) return;
        setCommentInput('');
        setCommentError('');
        commentInputRef.current?.blur(); // #10: dismiss mobile keyboard
        // Optimistic: use locally-known display name for instant feedback.
        // The server will store the canonical profile username — the real row
        // replaces this optimistic one once the API responds.
        const localDisplayName = user?.username || user?.user_metadata?.preferred_username || user?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Viewer';
        const optimisticId = `optimistic-${Date.now()}`;
        const optimisticComment = { id: optimisticId, stream_id: stream.id, user_id: userId, author_name: localDisplayName, text, created_at: new Date().toISOString() };
        setComments(prev => [...prev, optimisticComment]);
        try {
            // BUG FIX (V1): include Authorization header — getServerUserWithFallback
            // requires a bearer token on browsers where cookie-based fallback fails
            const token = getAccessToken();
            const resp = await fetch('/api/live/comment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ stream_id: stream.id, text }),
            });
            const json = await resp.json();
            if (!resp.ok) {
                // Remove optimistic comment and show error
                setComments(prev => prev.filter(c => c.id !== optimisticId));
                setCommentError(json.error || 'Comment failed');
                // BUG FIX (LV-1): track timer ref to prevent setState on unmounted component
                if (commentErrorTimerRef.current) clearTimeout(commentErrorTimerRef.current);
                commentErrorTimerRef.current = setTimeout(() => {
                    commentErrorTimerRef.current = null;
                    setCommentError('');
                }, 3000);
            } else if (json.comment) {
                // Replace optimistic comment with real DB row (has server-resolved author_name)
                setComments(prev => prev.map(c => c.id === optimisticId ? json.comment : c));
            }
        } catch (err) {
            setComments(prev => prev.filter(c => c.id !== optimisticId));
            setCommentError('Network error — please retry');
            // BUG FIX (LV-1): same fix for catch branch
            if (commentErrorTimerRef.current) clearTimeout(commentErrorTimerRef.current);
            commentErrorTimerRef.current = setTimeout(() => {
                commentErrorTimerRef.current = null;
                setCommentError('');
            }, 3000);
            console.warn('[LiveStreamViewer] comment failed:', err);
        }
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
            data-viewer-root
            style={{
            position: 'fixed', inset: 0, background: '#000', zIndex: 9999,
            display: 'flex', flexDirection: isTheaterMode ? 'row' : 'column', overflow: 'hidden'
        }}>
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>

            {/* Video Container - Split Screen Logic */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: isTheaterMode ? 'row' : 'column', background: '#000' }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                        flex: 1,
                        width: '100%',
                        height: '100%',
                        // BUG-FIX-LIVE-3 (viewer side): cover not contain, so the
                        // broadcaster's portrait video fills the viewer's portrait
                        // viewport edge-to-edge instead of letterboxing.
                        objectFit: 'cover',
                        // BUG-FIX-VIEWER-MIRROR: do NOT mirror on viewer side.
                        // Mirroring is a broadcaster-local UX aid (selfie preview).
                        // Viewers should see the natural broadcast orientation.
                        transition: 'all 0.3s ease'
                    }}
                />
                
                {/* Secondary Participants (Guest) */}
                {participants.map((p) => {
                    const isHost = String(p.identity) === String(stream?.broadcaster_id);
                    
                    const pubs = Array.from(p.videoTrackPublications.values());
                    const videoPub = pubs.find(pub => pub.track);
                    if (!videoPub?.track) return null;

                    // Host video is handled by a separate useEffect to prevent render loop spam
                    if (isHost) return null;

                    return (
                        <div key={p.identity} style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
                            <video
                                autoPlay
                                playsInline
                                muted
                                ref={el => {
                                    if (el) {
                                        try { videoPub.track.attach(el); } catch(e){}
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                            <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4, color: 'white', fontSize: 12 }}>
                                {p.name || 'Guest'}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Loading/Connecting Overlay */}
            {(isConnecting || isReconnecting) && !error && (
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
                    <div style={{ fontSize: 18, fontWeight: 500 }}>
                        {isReconnecting ? 'Reconnecting...' : 'Connecting To Stream...'}
                    </div>
                </div>
            )}

            {/* Error Message — BUG-FIX: added Close button so user can dismiss and continue */}
            {error && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        color: 'white',
                        background: 'rgba(0, 0, 0, 0.9)',
                        padding: '24px 40px',
                        borderRadius: 12,
                        zIndex: 50,
                        minWidth: 240,
                    }}
                >
                    <div style={{ fontSize: 18, fontWeight: 500 }}>{error}</div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
                        <button
                            onClick={() => setError('')}
                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
                        >
                            Dismiss
                        </button>
                        <button
                            onClick={handleLeave}
                            style={{ background: '#FA383E', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                        >
                            Leave Stream
                        </button>
                    </div>
                </div>
            )}

            {/* Feature 2: Gift flash animation with Lottie */}
            {giftFlash && (
                <div style={{
                    position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
                    zIndex: 25, animation: 'cdPop 0.5s ease-out',
                    textAlign: 'center', pointerEvents: 'none',
                }}>
                    <div style={{ width: 150, height: 150, margin: '0 auto' }}>
                        <Lottie animationData={diamondAnimation} loop={false} />
                    </div>
                    <div style={{ color: 'white', fontSize: 20, fontWeight: 800, textShadow: '0 2px 12px rgba(0,0,0,.8)' }}>
                        {giftFlash.name} Sent {giftFlash.amount} Diamonds!
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
                {/* Close Button — always functional, not dependent on theater state */}
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
                        zIndex: 60,
                    }}
                >
                    ✕
                </button>

                {/* BUG-FIX-SHARE: Share button for watchers */}
                <button
                    onClick={async () => {
                        const streamUrl = `${window.location.origin}/hub/social-media?stream=${stream?.id}`;
                        try {
                            if (navigator.share) {
                                await navigator.share({ title: streamData?.title || 'Live Stream', url: streamUrl });
                            } else {
                                await navigator.clipboard.writeText(streamUrl);
                                if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                                setShareToast('Link Copied!');
                                shareToastTimerRef.current = setTimeout(() => { shareToastTimerRef.current = null; setShareToast(''); }, 2500);
                            }
                        } catch (_) {}
                    }}
                    style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
                        border: 'none', color: 'white', fontSize: 20, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Share stream"
                >
                    📤
                </button>

                {/* Share toast */}
                {shareToast && (
                    <div style={{ position: 'absolute', top: 60, left: 12, background: 'rgba(0,200,100,0.9)', color: 'white', padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                        {shareToast}
                    </div>
                )}

                {/* Feature 3: Clip It */}
                <div style={{ position: 'absolute', bottom: 120, right: 16, zIndex: 20 }}>
                    <button
                        onClick={handleClipIt}
                        disabled={isClipping}
                        style={{
                            background: 'rgba(250,56,62,0.85)', border: 'none', color: 'white',
                            padding: '8px 14px', borderRadius: 8, cursor: isClipping ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                            boxShadow: '0 4px 12px rgba(250,56,62,0.4)', opacity: isClipping ? 0.7 : 1
                        }}
                    >
                        ✂️ {isClipping ? 'Clipping...' : 'Clip It'}
                    </button>
                </div>

                {/* BUG-FIX-LIVE-7 (Quality / PiP / Theatre):
                    - Quality: tracks activeQuality, shows ✓ on selected tier,
                      labels the trigger ("Quality · low"). Toast confirmation.
                    - PiP: surfaces a clear error if the browser/element
                      doesn't support it; was previously console.warn-only.
                    - Theatre: actually requests fullscreen on the video
                      element (with iOS webkitEnterFullscreen fallback)
                      instead of just toggling flexDirection. */}
                <div style={{ position: 'absolute', top: 70, right: 16, display: 'flex', gap: 8, zIndex: 20 }}>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowQualityMenu(!showQualityMenu)} style={{ background: 'rgba(0,0,0,.6)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                            Quality{activeQuality !== 'auto' ? ` · ${activeQuality}` : ''}
                        </button>
                        {showQualityMenu && (
                            <div style={{ position: 'absolute', top: 32, right: 0, background: 'rgba(0,0,0,0.85)', borderRadius: 8, overflow: 'hidden', minWidth: 120 }}>
                                {['auto', 'high', 'medium', 'low'].map(q => (
                                    <div
                                        key={q}
                                        onClick={() => {
                                            liveStreamService.setVideoQuality(q);
                                            setActiveQuality(q);
                                            setShowQualityMenu(false);
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            color: 'white',
                                            fontSize: 13,
                                            cursor: 'pointer',
                                            textTransform: 'capitalize',
                                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                                            background: activeQuality === q ? 'rgba(0,120,255,0.25)' : 'transparent',
                                            fontWeight: activeQuality === q ? 700 : 400,
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        }}
                                    >
                                        <span>{q}</span>
                                        {activeQuality === q && <span style={{ color: '#0066FF' }}>✓</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={async () => {
                            if (!videoRef.current) return;
                            // BUG-FIX-PIP: ensure video has srcObject and is playing before requesting PiP
                            if (!videoRef.current.srcObject) {
                                setError('Video not ready for PiP yet');
                                setTimeout(() => setError(''), 2500);
                                return;
                            }
                            const supported = typeof document !== 'undefined' && document.pictureInPictureEnabled;
                            const elSupported = videoRef.current && !videoRef.current.disablePictureInPicture;
                            if (!supported || !elSupported) {
                                setError('Picture-in-picture is not supported on this browser');
                                setTimeout(() => setError(''), 3000);
                                return;
                            }
                            // Ensure video is playing
                            try { await videoRef.current.play(); } catch (_) {}
                            await togglePiP();
                        }}
                        style={{ background: isPiP ? 'rgba(0,120,255,0.7)' : 'rgba(0,0,0,.6)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                        PiP
                    </button>
                    <button
                        onClick={async () => {
                            // BUG-FIX-THEATER: use the fullscreen API on the outer container
                            // (not just the video element) so the entire viewer UI enters fullscreen.
                            // Sync isTheaterMode from the fullscreenchange event listener, not here,
                            // to avoid the state/reality mismatch that caused the freeze.
                            const viewerContainer = videoRef.current?.closest('[data-viewer-root]') || videoRef.current?.parentElement?.parentElement?.parentElement?.parentElement;
                            try {
                                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                                    // Enter fullscreen
                                    if (viewerContainer?.requestFullscreen) {
                                        await viewerContainer.requestFullscreen();
                                    } else if (videoRef.current?.webkitEnterFullscreen) {
                                        videoRef.current.webkitEnterFullscreen();
                                        setIsTheaterMode(true);
                                    }
                                } else {
                                    // Exit fullscreen
                                    if (document.exitFullscreen) await document.exitFullscreen();
                                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                                }
                            } catch (_) { /* layout-only theatre mode is the fallback */ }
                        }}
                        style={{ background: isTheaterMode ? 'rgba(0,120,255,0.7)' : 'rgba(0,0,0,.6)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                        {isTheaterMode ? 'Exit' : 'Theater'}
                    </button>
                </div>



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
                        src={streamData?.broadcaster?.avatar_url || streamData?.profiles?.avatar_url || '/default-avatar.png'}
                        alt={streamData?.broadcaster?.username || streamData?.profiles?.username}
                        style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>
                            {streamData?.broadcaster?.username || streamData?.profiles?.username || 'Anonymous'}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                            {streamData?.category && streamData.category !== 'general'
                                ? streamData.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                                : 'Smarter.Poker'}
                        </div>
                    </div>
                    {/* #7: Follow button */}
                    {userId && (streamData?.broadcaster_id || stream?.broadcaster_id) && userId !== (streamData?.broadcaster_id || stream?.broadcaster_id) && (
                        <button
                            onClick={async () => {
                                if (followLoading) return;
                                setFollowLoading(true);
                                try {
                                    const broadcasterId = streamData?.broadcaster_id || stream?.broadcaster_id;
                                    if (isFollowing) {
                                        await supabase.from('social_follows')
                                            .delete()
                                            .eq('follower_id', userId)
                                            .eq('following_id', broadcasterId);
                                        setIsFollowing(false);
                                    } else {
                                        await supabase.from('social_follows')
                                            .upsert(
                                                { follower_id: userId, following_id: broadcasterId },
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
                {streamData?.title && (
                    <div style={{ color: 'white', fontSize: 15, lineHeight: 1.4 }}>
                        {streamData.title}
                    </div>
                )}
                {/* #9: Stream description */}
                {streamData?.description && (
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.3, marginTop: 4 }}>
                        {streamData.description}
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
                        <span style={{ color:'#00CFFF', fontWeight:700, fontSize:13, whiteSpace:'nowrap', flexShrink:0, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis' }}>{c.author_name || 'User'}</span>
                        <span style={{ color:'white', fontSize:13, lineHeight:1.4, wordBreak:'break-word', overflowWrap:'anywhere', flex:1 }}>{c.text}</span>
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
                    // BUG FIX (LSV-4): if not authed, show a hint instead of silently failing
                    placeholder={userId ? 'Say something...' : 'Sign in to chat...'}
                    disabled={!userId}
                    style={{ flex:1, padding:'9px 14px', borderRadius:22, border:'1.5px solid rgba(255,255,255,.3)', background: userId ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.3)', color:'white', fontSize:14, outline:'none', opacity: userId ? 1 : 0.6 }}
                />
                {/* Diamond gift button */}
                {(streamData?.broadcaster_id || stream?.broadcaster_id) && (streamData?.broadcaster_id || stream?.broadcaster_id) !== userId && (
                    <button
                        onClick={() => setShowGifts(true)}
                        style={{ padding:'9px 12px', borderRadius:22, border:'none', background:'rgba(255,215,0,0.85)', color:'#000', fontSize:16, fontWeight:700, cursor:'pointer' }}
                        title="Send diamond gift"
                    >
                        {/* User requested standard diamond asset with no background */}
                        <img src="/images/diamond.png" alt="Send Gift" style={{ width: 20, height: 20, display: 'block', margin: '-2px 0' }} />
                    </button>
                )}
                <button
                    onClick={handleSendComment}
                    style={{ padding:'9px 16px', borderRadius:22, border:'none', background:'rgba(0,120,255,.85)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer' }}
                >Send</button>
            </div>

            {/* Emoji reactions */}
            <LiveReactions streamId={stream?.id} userId={userId} />

            {/* Feature 5: Top Supporters Leaderboard */}
            {Object.keys(topGifters).length > 0 && (
                <div style={{ position: 'absolute', top: 120, right: 16, background: 'rgba(0,0,0,0.5)', padding: '10px 14px', borderRadius: 12, zIndex: 15, backdropFilter: 'blur(8px)', minWidth: 140 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#FFD700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Top Supporters</div>
                    {Object.entries(topGifters)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 3)
                        .map(([name, amount], idx) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'white', marginBottom: 4, alignItems: 'center' }}>
                                <span style={{ opacity: 0.9, display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, opacity: 0.7 }}>#{idx + 1}</span> {name}
                                </span>
                                <span style={{ fontWeight: 700, color: '#00CFFF' }}>{amount} 💎</span>
                            </div>
                        ))}
                </div>
            )}
            </div>

            {/* Gift panel */}
            {showGifts && (
                <LiveDiamondGift
                    streamId={stream?.id}
                    receiverId={streamData?.broadcaster_id || stream?.broadcaster_id}
                    userId={userId}
                    userBalance={userDiamondBalance}
                    onGiftSent={(amount, newBalance) => {
                        setUserDiamondBalance(newBalance);
                        // Local gift flash for sender
                        if (giftFlashTimerRef.current) clearTimeout(giftFlashTimerRef.current);
                        setGiftFlash({ name: 'You', amount });
                        giftFlashTimerRef.current = setTimeout(() => {
                            giftFlashTimerRef.current = null;
                            setGiftFlash(null);
                        }, 3000);
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
