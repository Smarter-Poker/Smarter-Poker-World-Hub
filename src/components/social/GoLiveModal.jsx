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
import toast from '../../stores/toastStore';
import { busEmit } from '../../engine/EventBus';
import Lottie from 'lottie-react';
import diamondAnimation from '../../../public/diamond-animation.json';
// BUG-FIX-LIVE-1: shared chime utility — armSuccessChime() in handleGoLive
// (a real user gesture) unlocks iOS Safari's AudioContext, then
// playSuccessChime() in startBroadcast plays the live-confirmation chime.
import { armSuccessChime, playSuccessChime } from '../../lib/successChime';
import useStreamingViewportLock from '../../lib/useStreamingViewportLock';
import {
    acquireMediaStream,
    releaseMediaStream,
    getCachedMediaStream,
} from '../../lib/mediaStreamSingleton';
import StreamPreviewCapture from '../../lib/streamPreviewCapture';
import { getAccessToken } from '../../lib/authUtils';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505',
    textSec: '#65676B', border: '#DADDE1', red: '#FA383E',
    blue: '#0066FF',
};

// ═══════════════════════════════════════════════════════════════════════════
// GUEST INVITE MODAL — Select a friend and send them an invite via DM
// ═══════════════════════════════════════════════════════════════════════════
function GuestInviteModal({ isOpen, onClose, streamId, inviteCode, currentUser }) {
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sendingId, setSendingId] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        const fetchFriends = async () => {
            try {
                const { getAccessToken } = await import('../../lib/authUtils');
                const token = getAccessToken();
                const res = await fetch('/api/friends?action=list', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const json = await res.json();
                if (json.success) setFriends(json.data?.friends || []);
            } catch (err) {}
            setLoading(false);
        };
        fetchFriends();
    }, [isOpen]);

    const sendInvite = async (friendId) => {
        setSendingId(friendId);
        try {
            const { getAccessToken } = await import('../../lib/authUtils');
            const token = getAccessToken();
            const { data: convId } = await supabase.rpc('fn_get_or_create_conversation', {
                user1_id: currentUser.id,
                user2_id: friendId,
            });
            if (!convId) throw new Error('No conversation');

            const inviteQs = `room=${streamId}&invite=${inviteCode}`;
            const res = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    conversationId: convId,
                    content: `[LIVE_INVITE]${inviteQs}`,
                    message_type: 'text'
                })
            });
            if (!res.ok) throw new Error('Send failed');
            toast.success('Invite sent!');
        } catch (err) {
            toast.error('Failed to send invite');
        }
        setSendingId(null);
    };

    if (!isOpen) return null;
    
    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div style={{ background: '#1C1E21', padding: 20, borderRadius: 12, width: '90%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>Invite Guest via Messenger</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
                </div>
                {loading ? <div style={{ color: '#aaa', textAlign: 'center', padding: '20px 0' }}>Loading friends...</div> : (
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {friends.length === 0 ? <div style={{ color: '#aaa', textAlign: 'center', padding: '20px 0' }}>No friends found.</div> : (
                            friends.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #333' }}>
                                    <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>{f.display_name || f.username}</div>
                                    <button 
                                        onClick={() => sendInvite(f.id)} 
                                        disabled={sendingId === f.id}
                                        style={{ background: sendingId === f.id ? '#444' : '#1877F2', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: sendingId === f.id ? 'default' : 'pointer', fontSize: 13 }}
                                    >
                                        {sendingId === f.id ? 'Sending...' : 'Invite'}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export function GoLiveModal({ isOpen, onClose, user, guestMode = false, initialRoomId = null, initialInviteCode = null }) {
    const [stage, setStage] = useState('preview'); // preview | countdown | live | ended
    const [title, setTitle] = useState('');
    const [error, setError] = useState('');
    const [viewerCount, setViewerCount] = useState(0);
    const [streamId, setStreamId] = useState(initialRoomId || null);
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
    // BUG-FIX-FLIP: track mirror state — front camera mirrors, rear doesn't
    const [isMirrored, setIsMirrored] = useState(true);
    const [category, setCategory] = useState('general');
    const [connectionQuality, setConnectionQuality] = useState('excellent');
    const [giftFlash, setGiftFlash] = useState(null);
    const [isStarting, setIsStarting] = useState(false);       // #3/#11: prevents double-tap on Go Live
    const [recordingFailed, setRecordingFailed] = useState(false); // #12: warns when recording unavailable
    const [description, setDescription] = useState(''); // #9: stream description
    const [topGifters, setTopGifters] = useState({}); // Feature 5: Top Supporters
    const [pinnedComment, setPinnedComment] = useState(null); // #18: pinned comment
    const [guestInviteCode, setGuestInviteCode] = useState(initialInviteCode || null); // #6: guest invite
    const [commentMenu, setCommentMenu] = useState(null); // #19: comment action menu
    const [isMuted, setIsMuted] = useState(false); // #6: mic mute toggle
    // BUG-FIX-LIVE-10 hardening: prevents double-tap on End Stream from
    // running two parallel finalize promises and racing the mediaRecorder.
    const [isEnding, setIsEnding] = useState(false);
    const [guestInviteModalOpen, setGuestInviteModalOpen] = useState(false); // New: invite guest via messenger
    // BUG FIX (GLM-3): separate toast state for share link (not reusing error)
    const [shareToast, setShareToast] = useState('');
    // BUG-FIX-RECONNECT: detect if user has an active live stream (reconnect flow)
    const [existingLiveStream, setExistingLiveStream] = useState(null);
    const [checkingExistingStream, setCheckingExistingStream] = useState(false);
    // BUG-FIX-WATCHDOG: 60s auto-end timer when reconnecting for too long
    const reconnectWatchdogRef = useRef(null);

    // Thumbnail state
    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState(null);
    const [thumbnailUrl, setThumbnailUrl] = useState(null);

    const [recordedBlob, setRecordedBlob] = useState(null);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [participants, setParticipants] = useState([]); // FEATURE 6: Split-screen state
    const timerRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const commentsEndRef = useRef(null);
    const thumbnailInputRef = useRef(null);
    const commentInputRef = useRef(null); // #10: blur after send to dismiss keyboard
    const hideControlsRef = useRef(null);
    const commentChannelRef = useRef(null);
    // BUG FIX (GLM-1): track giftFlash timer ref to prevent broadcaster-side timer storm
    const giftFlashTimerRef = useRef(null);
    // BUG FIX (GLM-3): track share toast timer ref
    const shareToastTimerRef = useRef(null);
    // BUG FIX (GLM-5): track in-flight getUserMedia mount guard
    const mediaAccessMountedRef = useRef(true);
    // BUG FIX (GLM-6): track error-clear timer so it cancels on unmount
    const errorTimerRef = useRef(null);
    // BUG-FIX-LIVE-5: rolling preview capture (uploads ~12s loop clip every 25s)
    const previewCaptureRef = useRef(null);

    // BUG-FIX-LIVE-7+8: lock viewport, kill pinch zoom, recover from rotation
    // during live/countdown. Prevents the "icons stay zoomed and screen won't
    // go back to normal" failure mode after pinch or orientation change.
    useStreamingViewportLock(stage === 'live' || stage === 'countdown');

    useEffect(() => {
        mediaAccessMountedRef.current = true;
        if (isOpen) {
            requestMediaAccess();
            // BUG-FIX-RECONNECT: on open, check if user has a zombie live stream
            // they may want to reconnect to (e.g. lost connection/power).
            if (user?.id && !guestMode) {
                setCheckingExistingStream(true);
                supabase
                    .from('live_streams')
                    .select('id, title, started_at')
                    .eq('broadcaster_id', user.id)
                    .eq('status', 'live')
                    .maybeSingle()
                    .then(({ data }) => {
                        if (data) setExistingLiveStream(data);
                        setCheckingExistingStream(false);
                    })
                    .catch(() => setCheckingExistingStream(false));
            }
        }
        return () => {
            mediaAccessMountedRef.current = false;
            liveStreamService.onViewerCountChange = null;
            liveStreamService.onParticipantsUpdate = null; // FEATURE 6
            // BUG-FIX-LIVE-2: do NOT stop streamRef tracks here — they belong
            // to the module-level mediaStreamSingleton and are reused across
            // modal opens to prevent iOS Safari re-prompting for camera/mic.
            // Cleanup of the actual MediaStream happens only on full
            // navigation away from the streaming surface (handled at the
            // page-level layout) or via releaseMediaStream({force:true}).
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
            if (hideControlsRef.current) clearTimeout(hideControlsRef.current);
            if (commentChannelRef.current) supabase.removeChannel(commentChannelRef.current);
            // BUG FIX (GLM-1): cancel any in-flight giftFlash timer on modal close
            if (giftFlashTimerRef.current) clearTimeout(giftFlashTimerRef.current);
            // BUG FIX (GLM-3): cancel share toast timer on modal close
            if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
            // BUG FIX (GLM-6): cancel error clear timer on modal close
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
            // BUG-FIX-WATCHDOG: cancel watchdog timer on modal close
            if (reconnectWatchdogRef.current) { clearTimeout(reconnectWatchdogRef.current); reconnectWatchdogRef.current = null; }
            // FIX: countdown interval cleanup was AFTER the return — unreachable dead code
            if (timerRef._cdInterval) { clearInterval(timerRef._cdInterval); timerRef._cdInterval = null; }
            // FIX: if modal is force-closed during live broadcast, end the broadcast to prevent zombie room
            if (liveStreamService.room && liveStreamService.isBroadcaster) {
                liveStreamService.endBroadcast().catch(() => {});
                busEmit.dataMutated?.('live_streams');
            }
            // BUG-FIX-LIVE-5: stop the rolling preview capture on force-close
            if (previewCaptureRef.current) {
                try { previewCaptureRef.current.stop(); } catch (_) {}
                previewCaptureRef.current = null;
            }
            // FIX: null stale singleton callbacks
            liveStreamService.onViewerCountChange = null;
            liveStreamService.onReconnecting = null;
            liveStreamService.onReconnected = null;
            liveStreamService.onConnectionQualityChange = null;
        };
    }, [isOpen]);

    // #14: beforeunload — end broadcast if user closes tab/navigates away while live
    useEffect(() => {
        if (stage !== 'live' || !streamId) return;
        const handleBeforeUnload = (e) => {
            // Fire-and-forget — navigator.sendBeacon can't do POST with JSON,
            // so we use the sync LiveKit disconnect + DB update
            liveStreamService.endBroadcast().catch(() => {});
            e.returnValue = 'Your live stream is still running. Are you sure you want to leave?';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [stage, streamId]);

    // Subscribe to viewer comments when stream goes live
    useEffect(() => {
        if (!streamId) return;
        const ch = supabase
            .channel(`live-comments-broadcaster-${streamId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `stream_id=eq.${streamId}` },
                (payload) => {
                    if (payload.new.user_id !== user?.id) { // Don't double-add own comments
                        setComments(prev => {
                            if (prev.some(c => c.id === payload.new.id)) return prev;
                            return [...prev, payload.new];
                        });
                    }
                }
            ).subscribe();
        commentChannelRef.current = ch;
        return () => { supabase.removeChannel(ch); };
    }, [streamId, user?.id]);

    // Subscribe to gift events for gift animations
    useEffect(() => {
        if (!streamId) return;

        // Fetch historical gifts for leaderboard
        fetch(`/api/live/gifts?stream_id=${streamId}`)
            .then(res => res.json())
            .then(data => {
                if (data.topGifters) {
                    setTopGifters(data.topGifters);
                }
            })
            .catch(err => console.error('Failed to load gifts', err));

        const giftCh = supabase.channel(`live-gifts-${streamId}`, {
            config: { broadcast: { self: false } },
        });
        giftCh.on('broadcast', { event: 'gift' }, ({ payload }) => {
            if (payload?.sender_name && payload?.amount) {
                // BUG FIX (GLM-1): cancel previous timer before setting new one (timer storm)
                if (giftFlashTimerRef.current) clearTimeout(giftFlashTimerRef.current);
                setGiftFlash({ name: payload.sender_name, amount: payload.amount });
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
        return () => {
            supabase.removeChannel(giftCh);
            // BUG FIX (GLM-1): also clear on effect cleanup
            if (giftFlashTimerRef.current) { clearTimeout(giftFlashTimerRef.current); giftFlashTimerRef.current = null; }
        };
    }, [streamId]);

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
        // BUG-FIX-LIVE-2 (per Dan: "user should only have to enable the
        // microphone and camera one time on mobile and not asked every
        // single time"). The singleton caches the MediaStream module-wide,
        // so reopening the Go Live modal within the same page session
        // reuses the existing stream and never re-triggers iOS Safari's
        // permission UI. See src/lib/mediaStreamSingleton.js.
        try {
            // Synchronous fast-path — if a cached stream already exists,
            // attach it before the await so the video element shows the
            // preview instantly on modal reopen.
            const cached = getCachedMediaStream();
            if (cached) {
                streamRef.current = cached;
                if (videoRef.current) videoRef.current.srcObject = cached;
                setStage('preview');
                setError('');
                return;
            }

            const stream = await acquireMediaStream();
            // Modal could have closed while the prompt was open — guard
            // before touching DOM/state.
            if (!mediaAccessMountedRef.current) return;

            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            setStage('preview');
            setError('');
        } catch (err) {
            if (mediaAccessMountedRef.current) {
                setError('Camera access denied. Please allow camera and microphone permissions.');
            }
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
        if (!mime) {
            // #12: No supported codec — recording is impossible (e.g. some Safari versions)
            setRecordingFailed(true);
            return;
        }
        setRecordingFailed(false);
        const mr = new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 2500000 });
        mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        mr.onstop = () => setRecordedBlob(new Blob(recordedChunksRef.current, { type: mime }));
        mr.start(1000);
        mediaRecorderRef.current = mr;
    };

    const handleGoLive = async () => {
        // #3/#11: Prevent double-tap / double-broadcast on slow networks
        if (isStarting) return;
        if (!streamRef.current || !user?.id) { setError('Unable to start stream.'); return; }
        // BUG-FIX-LIVE-1: arm the chime here, INSIDE the click handler before
        // any await — iOS Safari only honors AudioContext unlock if it
        // happens synchronously inside the user gesture callback. The
        // actual chime fires several seconds later (after countdown +
        // LiveKit handshake) when armed context is reused.
        armSuccessChime();
        setIsStarting(true);
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
                    if (!thumbUrl) console.warn('[GoLive] auto-thumbnail upload returned null');
                } catch (thumbErr) {
                    console.warn('[GoLive] auto-thumbnail failed:', thumbErr?.message || thumbErr);
                    thumbUrl = null;
                }
            } else {
                console.warn('[GoLive] captureThumbnail returned null — videoWidth:', videoRef.current?.videoWidth);
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
            liveStreamService.onReconnecting = () => {
                setIsReconnecting(true);
                // BUG-FIX-WATCHDOG: start 60s timer — if still reconnecting after 60s, auto-end
                if (reconnectWatchdogRef.current) clearTimeout(reconnectWatchdogRef.current);
                reconnectWatchdogRef.current = setTimeout(() => {
                    reconnectWatchdogRef.current = null;
                    // Only auto-end if still in reconnecting state
                    setIsReconnecting(prev => {
                        if (prev) {
                            console.warn('[GoLive] 60s reconnect watchdog fired — auto-ending stream');
                            handleEndStream();
                        }
                        return prev;
                    });
                }, 60000);
            };
            liveStreamService.onReconnected = () => {
                setIsReconnecting(false);
                // Cancel watchdog if we successfully reconnected
                if (reconnectWatchdogRef.current) { clearTimeout(reconnectWatchdogRef.current); reconnectWatchdogRef.current = null; }
            };
            liveStreamService.onConnectionQualityChange = (q) => setConnectionQuality(q);
            liveStreamService.onParticipantsUpdate = (ps) => setParticipants(ps); // FEATURE 6

            // BUG-FIX-LIVE-5 verification: capture the active stream id locally
            // — React's setStreamId is async, so reading `streamId` (state) below
            // would give us the previous render's value (null on first broadcast).
            // The LiveStreamService field is `currentStreamId` (not `streamId`).
            let activeStreamId = null;

            if (guestMode && initialRoomId && initialInviteCode) {
                await liveStreamService.joinAsGuest(user.id, initialRoomId, initialInviteCode, streamRef.current);
                activeStreamId = initialRoomId;
                setStreamId(initialRoomId);
                setGuestInviteCode(initialInviteCode);
            } else {
                const { streamId: newId, guestInviteCode: newInviteCode } = await liveStreamService.startBroadcast(
                    user.id,
                    title || `${user.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Live'}'s Live`,
                    streamRef.current,
                    thumbUrl,
                    category,
                    description
                );
                activeStreamId = newId;
                setStreamId(newId);
                setGuestInviteCode(newInviteCode);
            }

            setStage('live');
            setElapsedTime(0);
            startRecording();

            // BUG-FIX-LIVE-5: start the rolling preview clip uploader. It
            // runs in parallel to the main MediaRecorder using the SAME local
            // stream, uploads a fresh ~12s clip every 25s to Supabase Storage,
            // and updates live_streams.preview_clip_url so feed cards can
            // autoplay it on loop instead of opening per-card LiveKit
            // connections. First clip lands ~25s in.
            //
            // Guests do NOT run preview capture — only the broadcaster's
            // primary device should write the preview clip URL for the room.
            try {
                if (!guestMode && streamRef.current && activeStreamId) {
                    if (previewCaptureRef.current) {
                        try { previewCaptureRef.current.stop(); } catch (_) {}
                    }
                    previewCaptureRef.current = new StreamPreviewCapture({
                        mediaStream: streamRef.current,
                        streamId: activeStreamId,
                        userId: user.id,
                        getAccessToken: () => getAccessToken(),
                        supabase,
                        onError: (err) => {
                            // Preview capture is non-fatal — log and continue.
                            // Live broadcast itself is unaffected; viewers just
                            // see the static thumbnail until the next window.
                            console.warn('[StreamPreviewCapture]', err?.message || err);
                        },
                    });
                    previewCaptureRef.current.start();
                }
            } catch (previewErr) {
                console.warn('[GoLive] preview capture init failed:', previewErr?.message || previewErr);
            }

            timerRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
            // BUG-FIX-LIVE-1: play chime via the AudioContext armed in
            // handleGoLive(). toast.success below ALSO calls toastStore's
            // _playSuccessChime, but that creates a fresh AudioContext on
            // every call — on iOS Safari the new context starts in
            // 'suspended' state because we're well past the user gesture
            // (countdown + LiveKit handshake elapsed). Calling our
            // already-armed shared playSuccessChime guarantees audible
            // playback. The toastStore chime is harmless if it does fire.
            playSuccessChime();
            toast.success('You Are Now Live!');
            // Real-time fanout — open social-media feeds (LiveStreamCard
            // inlineAutoplay) re-render and pick up the new live tile
            // immediately via the EventBus 'live_streams' channel.
            busEmit.dataMutated?.('live_streams');
            try { busEmit.dataMutated?.('social_posts'); } catch (_) {}
        } catch (err) {
            setError(err.message || 'Failed to start broadcast.');
            setStage('preview');
            setIsStarting(false); // BUG FIX: reset so user can retry
        }
    };

    const handleScreenTap = useCallback(() => {
        setShowControls(prev => {
            if (prev) {
                if (hideControlsRef.current) clearTimeout(hideControlsRef.current);
                return false;
            } else {
                if (hideControlsRef.current) clearTimeout(hideControlsRef.current);
                hideControlsRef.current = setTimeout(() => setShowControls(false), 4000);
                return true;
            }
        });
    }, []);

    const handleEndStream = async () => {
        // BUG-FIX-LIVE-10 hardening: ignore re-entry. Without this, a fast
        // double-tap on End Stream runs two finalizeRecording promises in
        // parallel and the mediaRecorder errors out before either resolves.
        if (isEnding) return;
        setIsEnding(true);

        // #1: Confirm before ending — prevents accidental stream kills
        if (!confirm('End your live stream? This will stop broadcasting to all viewers.')) {
            setIsEnding(false);
            return;
        }

        // BUG-FIX-LIVE-10 (per Dan: "WHEN I CLICKED END STREAM, IT DID NOT DO
        // WHAT IT USED TO, AND GIVE ME THE OPTION TO SAVE OR PUBLISH... SCREEN
        // JUST FREEZES AND LIVE STREAM ENDS FOR VIEWERS, BUT CAN'T DO ANYTHING
        // AFTER THAT...").
        //
        // Root cause: handleEndStream awaited liveStreamService.endBroadcast()
        // BEFORE flipping stage to 'ended'. If that call threw (LiveKit
        // disconnect race) or hung past the user's patience, we landed in the
        // catch block which only setError'd — stage stayed 'live', viewers had
        // already disconnected, camera tracks were still live, UI looked
        // permanently frozen.
        //
        // Fix: snapshot the recording, kill local tracks + timer, transition
        // to 'ended' SYNCHRONOUSLY, THEN fire endBroadcast in the background.
        // The catch path also transitions — there is no code path where the
        // user remains on the live UI after tapping End Stream.

        // ── 1. Snapshot the recording (with 4s safety cap) ───────────────────
        const finalizeRecording = () => new Promise((resolve) => {
            const mr = mediaRecorderRef.current;
            if (!mr || mr.state === 'inactive') return resolve(null);
            const mime = mr.mimeType || 'video/webm';
            let settled = false;
            const onStopOnce = () => {
                if (settled) return;
                settled = true;
                try { mr.removeEventListener('stop', onStopOnce); } catch (_) {}
                try {
                    const blob = new Blob(recordedChunksRef.current, { type: mime });
                    resolve(blob);
                } catch (_e) { resolve(null); }
            };
            mr.addEventListener('stop', onStopOnce);
            try { mr.stop(); } catch (_) { onStopOnce(); }
            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    try { mr.removeEventListener('stop', onStopOnce); } catch (_) {}
                    resolve(null);
                }
            }, 4000);
        });

        let finalBlob = null;
        try {
            finalBlob = await finalizeRecording();
        } catch (err) {
            console.warn('[handleEndStream] recording finalize threw:', err);
        }

        // ── 2. Stop the live timer + reset starting flag ────────────────────
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setIsStarting(false);

        // ── 2a. Stop the rolling preview capture ────────────────────────────
        // BUG-FIX-LIVE-5: any in-flight upload is allowed to complete (it has
        // no awaiters); the recorder is halted so no new windows kick off.
        if (previewCaptureRef.current) {
            try { previewCaptureRef.current.stop(); } catch (_) {}
            previewCaptureRef.current = null;
        }

        // ── 3. Lock in the recorded blob, then atomically flip to 'ended' ───
        // setRecordedBlob fires in the same React commit as setStage so the
        // EndStreamModal mounts with a non-null videoBlob → Save/Post buttons
        // enabled.
        if (finalBlob) setRecordedBlob(finalBlob);
        setStage('ended');
        setShowAnalytics(true);

        // ── 4. End the LiveKit broadcast in the background ──────────────────
        // Failure here is non-fatal to the streamer's UX — they're already on
        // the post-stream screen. Viewers will see the disconnect either way.
        liveStreamService.endBroadcast().catch((err) => {
            console.warn('[handleEndStream] endBroadcast non-fatal error:', err?.message || err);
        });

        // ── 5. Real-time fanout — feed cards re-render and pick up the
        // ended stream state via the EventBus 'live_streams' channel.
        try { busEmit.dataMutated?.('live_streams'); } catch (_) {}
        try { busEmit.dataMutated?.('social_posts'); } catch (_) {}
    };

    const handleFlipCamera = async () => {
        if (isCameraFlipping) return;
        setIsCameraFlipping(true);
        try {
            await liveStreamService.flipCamera();
            // FIX: use service's localStream which has both new video + original audio.
            // The returned newStream is video-only and would break recording audio.
            const fullStream = liveStreamService.localStream;
            if (fullStream && videoRef.current) {
                videoRef.current.srcObject = fullStream;
                streamRef.current = fullStream;
            }
            // BUG-FIX-FLIP: toggle mirror based on camera facing mode
            // Front (user) camera needs mirror, rear (environment) does not
            setIsMirrored(liveStreamService.cameraMode === 'user');
        } catch (err) {
            setError('Camera flip failed: ' + err.message);
        } finally {
            setIsCameraFlipping(false);
        }
    };

    const handleReconnectToExisting = async () => {
        if (!existingLiveStream) return;
        if (!streamRef.current) {
            setError('Please allow camera access before reconnecting.');
            return;
        }
        setIsStarting(true);
        setError('');
        try {
            liveStreamService.onViewerCountChange = (c) => setViewerCount(c);
            liveStreamService.onReconnecting = () => setIsReconnecting(true);
            liveStreamService.onReconnected = () => setIsReconnecting(false);
            liveStreamService.onConnectionQualityChange = (q) => setConnectionQuality(q);
            liveStreamService.onParticipantsUpdate = (ps) => setParticipants(ps);
            // Re-join the existing LiveKit room
            const { token, url } = await liveStreamService._getToken(existingLiveStream.id, true);
            if (liveStreamService.room) {
                liveStreamService.room.disconnect().catch(() => {});
                liveStreamService.room = null;
            }
            liveStreamService.currentStreamId = existingLiveStream.id;
            liveStreamService.isBroadcaster = true;
            liveStreamService.isManualDisconnect = false;
            liveStreamService.localStream = streamRef.current;
            await liveStreamService._connectRoom(url, token, true, streamRef.current);
            setStreamId(existingLiveStream.id);
            setTitle(existingLiveStream.title || '');
            setStage('live');
            setExistingLiveStream(null);
            startRecording();
            timerRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
            toast.success('Reconnected to your live stream!');
            busEmit.dataMutated?.('live_streams');
        } catch (err) {
            setError('Reconnect failed: ' + err.message);
        } finally {
            setIsStarting(false);
        }
    };

    const handleShare = async () => {
        const url = `${window.location.origin}/hub/social-media?stream=${streamId}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: title || 'Live Stream', url });
            } else {
                await navigator.clipboard.writeText(url);
                // BUG FIX (GLM-3): use dedicated toast state + tracked timer, not error state
                if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                setShareToast('Link copied to clipboard!');
                shareToastTimerRef.current = setTimeout(() => {
                    shareToastTimerRef.current = null;
                    setShareToast('');
                }, 2500);
            }
        } catch { /* ignore user cancel */ }
    };

    const handleToggleMute = async () => {
        try {
            const newMuted = await liveStreamService.toggleMute();
            setIsMuted(newMuted);
        } catch (err) {
            console.warn('[GoLive] mute toggle failed:', err);
        }
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
        commentInputRef.current?.blur(); // #10: dismiss mobile keyboard
        const authorName = user.username || user.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Broadcaster';
        const optimisticId = `opt-${Date.now()}`;
        const newComment = { id: optimisticId, user_id: user.id, author_name: authorName, text, created_at: new Date().toISOString() };
        setComments(prev => [...prev, newComment]);
        try {
            // BUG FIX (GLM-2): broadcaster comments now go through /api/live/comment
            // (just like viewers do) so ban-check, slow-mode, and server-side author_name
            // resolution all apply uniformly. Direct anon-key insert bypassed all of this.
            const { getAccessToken } = await import('../../lib/authUtils');
            const token = getAccessToken();
            const resp = await fetch('/api/live/comment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ stream_id: streamId, text }),
            });
            const json = await resp.json();
            if (!resp.ok) {
                setComments(prev => prev.filter(c => c.id !== optimisticId));
                setError(json.error || 'Comment failed');
                // BUG FIX (GLM-6): track timer so cancel on unmount avoids stale setState
                if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
                errorTimerRef.current = setTimeout(() => {
                    errorTimerRef.current = null;
                    setError('');
                }, 3000);
            } else if (json.comment) {
                setComments(prev => prev.map(c => c.id === optimisticId ? json.comment : c));
            }
        } catch (err) {
            setComments(prev => prev.filter(c => c.id !== optimisticId));
            console.warn('[GoLive] comment failed:', err);
        }
    };

    const handleEndStreamModalClose = (action) => {
        // BUG-FIX-LIVE-2: do NOT stop tracks here — keep the singleton alive
        // so the user can immediately go live again without re-prompting for
        // camera/mic permission. The singleton will be released only when
        // the user navigates away from the streaming surface entirely.
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
        // BUG FIX: reset all state added by improvement items
        setIsStarting(false);
        setRecordingFailed(false);
        setDescription('');
        setPinnedComment(null);
        setGuestInviteCode(null);
        setCommentMenu(null);
        setIsMuted(false);
        // BUG-FIX-LIVE-10: clear the re-entry guard so the next Go Live
        // session can use End Stream again.
        setIsEnding(false);
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
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:10000, display:'flex', alignItems:(stage === 'live' || stage === 'countdown') ? 'center' : 'flex-start', justifyContent:'center', overflowY: (stage === 'live' || stage === 'countdown') ? 'hidden' : 'auto', padding: (stage === 'live' || stage === 'countdown') ? 0 : 'max(20px, env(safe-area-inset-top, 20px)) 0 max(20px, env(safe-area-inset-bottom, 20px))' }}
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
                overflow: (stage === 'live' || stage === 'countdown') ? 'hidden' : 'auto',
                WebkitOverflowScrolling: 'touch',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
            }}>

                {/* ── PREVIEW STAGE ── */}
                {stage === 'preview' && (
                    <div>
                        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:C.text }}>{guestMode ? 'Join Stream' : 'Go Live'}</h2>
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                                {!guestMode && (
                                    <button
                                        onClick={() => setShowSchedule(true)}
                                        style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 12px', fontSize:13, color:C.textSec, cursor:'pointer' }}
                                    >
                                        Schedule
                                    </button>
                                )}
                                <button onClick={onClose} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:C.textSec }}>✕</button>
                            </div>
                        </div>

                        {/* BUG-FIX-RECONNECT: banner if user has active stream to reconnect to */}
                        {existingLiveStream && (
                            <div style={{ background:'rgba(250,56,62,0.1)', border:'1px solid rgba(250,56,62,0.4)', borderRadius:10, padding:'12px 16px', margin:'0 20px 4px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                                <div>
                                    <div style={{ fontWeight:700, color:'#FA383E', fontSize:14 }}>⚡ Active Stream Detected</div>
                                    <div style={{ color:'#65676B', fontSize:12, marginTop:2 }}>{existingLiveStream.title || 'Your Live'} is still running. Reconnect?</div>
                                </div>
                                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                                    <button onClick={() => setExistingLiveStream(null)} style={{ background:'none', border:'1px solid #DADDE1', borderRadius:8, padding:'6px 12px', fontSize:13, cursor:'pointer', color:'#65676B' }}>Dismiss</button>
                                    <button onClick={handleReconnectToExisting} disabled={isStarting} style={{ background:'#FA383E', border:'none', borderRadius:8, padding:'6px 14px', fontSize:13, fontWeight:700, cursor:'pointer', color:'white' }}>
                                        {isStarting ? 'Reconnecting...' : 'Reconnect'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Camera preview */}
                        <div style={{ position:'relative', background:'#000', aspectRatio:'16/9' }}>
                            <video ref={videoRef} autoPlay muted playsInline disablePictureInPicture controls={false} style={{ width:'100%', height:'100%', objectFit:'cover', transform: isMirrored ? 'scaleX(-1)' : 'none', transition: 'all 0.3s ease' }} />
                            <div style={{ position:'absolute', top:10, left:10, background:'rgba(0,0,0,.55)', color:'white', padding:'4px 10px', borderRadius:6, fontSize:13, fontWeight:600 }}>Preview</div>
                        </div>

                        <div style={{ padding:20 }}>
                            {!guestMode && (
                                <>
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

                                    {/* Description field */}
                                    <label style={{ display:'block', marginTop:14, marginBottom:8, fontWeight:700, fontSize:14, color:C.text }}>Description</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="What will you be playing or talking about?"
                                        rows={2}
                                        maxLength={200}
                                        style={{ width:'100%', padding:'11px 14px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, outline:'none', boxSizing:'border-box', color:C.text, resize:'none', fontFamily:'inherit' }}
                                    />

                                    {/* Category selector */}
                                    <label style={{ display:'block', marginTop:14, marginBottom:8, fontWeight:700, fontSize:14, color:C.text }}>Category</label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        style={{ width:'100%', padding:'11px 14px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:15, outline:'none', boxSizing:'border-box', color:C.text, background:'white', appearance:'auto' }}
                                    >
                                        <option value="general">General</option>
                                        <option value="cash_game">Cash Game</option>
                                        <option value="tournament">Tournament</option>
                                        <option value="strategy">Strategy Talk</option>
                                        <option value="hand_review">Hand Review</option>
                                        <option value="just_chatting">Just Chatting</option>
                                    </select>
                                </>
                            )}

                            {error && <div style={{ color:C.red, marginTop:10, fontSize:14 }}>{error}</div>}

                            <div style={{ display:'flex', gap:12, marginTop:18 }}>
                                <button onClick={onClose} style={{ flex:1, padding:'13px 20px', borderRadius:8, border:`1px solid ${C.border}`, background:'white', color:C.text, fontSize:15, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                                <button
                                    onClick={handleGoLive}
                                    disabled={isStarting}
                                    style={{ flex:1, padding:'13px 20px', borderRadius:8, border:'none', background:C.red, color:'white', fontSize:15, fontWeight:700, cursor: isStarting ? 'not-allowed' : 'pointer', opacity: isStarting ? 0.6 : 1 }}
                                >
                                    {isStarting ? 'Starting...' : (guestMode ? 'Join as Guest' : 'Go Live')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── COUNTDOWN STAGE ── */}
                {stage === 'countdown' && (
                    <div style={{ position:'relative', width:'100%', height:'100%', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', touchAction:'none', overflow:'hidden' }}>
                        <video ref={videoRef} autoPlay muted playsInline disablePictureInPicture controls={false} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transform: isMirrored ? 'scaleX(-1)' : 'none', opacity:.4 }} />
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
                        style={{ height:'100%', width:'100%', position:'relative', background:'#000', cursor:'pointer', touchAction:'none', overflow:'hidden' }}
                        onClick={handleScreenTap}
                    >
                        {/* Broadcaster/Local Video + Remote Participants */}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#000' }}>
                            {/* BUG-FIX-FLIP: mirror only front-facing (user) camera */}
                            <video ref={videoRef} autoPlay muted playsInline disablePictureInPicture controls={false} style={{ flex: 1, width: '100%', height: '100%', objectFit: 'cover', transform: isMirrored ? 'scaleX(-1)' : 'none', transition: 'all 0.3s ease' }} />
                            
                            {/* Secondary Participants (Guest) */}
                            {participants.map((p, idx) => {
                                const pubs = Array.from(p.videoTrackPublications.values());
                                const videoPub = pubs.find(pub => pub.track);
                                if (!videoPub) return null;

                                return (
                                    <div key={p.identity} style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
                                        <video
                                            autoPlay
                                            playsInline
                                            muted
                                            ref={el => {
                                                if (el && videoPub.track) {
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

                        {/* Reconnect overlay */}
                        {isReconnecting && (
                            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.7)', zIndex:30, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                                <div style={{ width:48, height:48, borderRadius:'50%', border:'4px solid rgba(255,255,255,0.2)', borderTopColor:'#0066FF', animation:'spin 0.8s linear infinite', marginBottom:16 }} />
                                <div style={{ color:'white', fontSize:16, fontWeight:700 }}>Reconnecting...</div>
                                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginTop:6 }}>Please wait</div>
                            </div>
                        )}

                        {/* Feature 2: Gift flash animation with Lottie */}
                        {giftFlash && (
                            <div style={{
                                position:'absolute', top:'35%', left:'50%', transform:'translate(-50%,-50%)',
                                zIndex:25, animation:'cdPop 0.5s ease-out',
                                textAlign:'center', pointerEvents:'none',
                            }}>
                                <div style={{ width: 150, height: 150, margin: '0 auto' }}>
                                    <Lottie animationData={diamondAnimation} loop={false} />
                                </div>
                                <div style={{ color:'white', fontSize:20, fontWeight:800, textShadow:'0 2px 12px rgba(0,0,0,.8)' }}>
                                    {giftFlash.name} Sent {giftFlash.amount} Diamonds!
                                </div>
                            </div>
                        )}

                        {/* TOP-LEFT: LIVE badge + REC + connection quality */}
                        <div style={{ position:'absolute', top: 'max(20px, env(safe-area-inset-top, 20px))', left:16, display:'flex', gap:10, alignItems:'center', zIndex:10 }}>
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
                            {/* #12: Recording failed warning badge */}
                            {recordingFailed && (
                                <div style={{ background:'rgba(255,165,0,0.85)', color:'white', padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700 }}>
                                    NO REC
                                </div>
                            )}
                            {/* Connection quality indicator */}
                            <div
                                title={`Connection: ${connectionQuality}`}
                                style={{
                                    width:12, height:12, borderRadius:'50%',
                                    background: connectionQuality === 'excellent' ? '#42B72A'
                                        : connectionQuality === 'good' ? '#42B72A'
                                        : connectionQuality === 'poor' ? '#FFA500'
                                        : '#FA383E',
                                    boxShadow: `0 0 6px ${connectionQuality === 'excellent' || connectionQuality === 'good' ? '#42B72A' : connectionQuality === 'poor' ? '#FFA500' : '#FA383E'}`,
                                }}
                            />
                        </div>

                        {/* TOP-RIGHT: viewer count */}
                        <div style={{ position:'absolute', top: 'max(20px, env(safe-area-inset-top, 20px))', right:16, background:'rgba(0,0,0,.55)', color:'white', padding:'6px 14px', borderRadius:8, fontSize:14, fontWeight:600, zIndex:10, display:'flex', alignItems:'center', gap:6 }}>
                            <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                            {viewerCount} {viewerCount === 1 ? 'viewer' : 'viewers'}
                            {isMuted && <span style={{ marginLeft:6, opacity:0.7 }}>🔇</span>}
                        </div>

                        {/* BOTTOM-RIGHT: elapsed timer */}
                        <div style={{ position:'absolute', bottom:110, right:16, background:'rgba(0,0,0,.55)', color:'white', padding:'6px 12px', borderRadius:8, fontSize:14, fontWeight:700, zIndex:10, fontVariantNumeric:'tabular-nums' }}>
                            {formatTime(elapsedTime)}
                        </div>

                        {/* Stream description (visible to broadcaster) */}
                        {description && (
                            <div style={{ position:'absolute', top: 'max(56px, calc(env(safe-area-inset-top, 20px) + 36px))', left:16, right:80, zIndex:8, background:'rgba(0,0,0,0.45)', borderRadius:8, padding:'6px 12px', maxWidth:'60vw' }}>
                                <div style={{ color:'rgba(255,255,255,0.7)', fontSize:11, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{description}</div>
                            </div>
                        )}

                        {/* Emoji reactions */}
                        <LiveReactions streamId={streamId} userId={user?.id} isBroadcaster />

                        {/* New feature: Guest Invite Modal overlay */}
                        <GuestInviteModal 
                            isOpen={guestInviteModalOpen} 
                            onClose={() => setGuestInviteModalOpen(false)}
                            streamId={streamId}
                            inviteCode={guestInviteCode}
                            currentUser={user}
                        />

                        {/* #18: PINNED COMMENT */}
                        {pinnedComment && (
                            <div style={{ position:'absolute', bottom:320, left:12, right:80, zIndex:10, background:'rgba(0,0,0,0.7)', borderRadius:10, padding:'8px 12px', border:'1px solid rgba(255,215,0,0.3)' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                                    <span style={{ color:'#FFD700', fontSize:11, fontWeight:700 }}>PINNED</span>
                                    <button onClick={() => { setPinnedComment(null); liveStreamService.unpinComment(streamId).catch(() => {}); }} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:14, cursor:'pointer', padding:0 }}>✕</button>
                                </div>
                                <span style={{ color:'#00CFFF', fontWeight:700, fontSize:12, marginRight:6 }}>{pinnedComment.author_name}</span>
                                <span style={{ color:'white', fontSize:12 }}>{pinnedComment.text}</span>
                            </div>
                        )}

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

                        {/* COMMENTS OVERLAY — left side, scrollable */}
                        <div style={{ position:'absolute', bottom:110, left:0, width:'min(320px, 60vw)', maxHeight:200, overflowY:'auto', zIndex:10, padding:'0 12px', scrollbarWidth:'none' }}>
                            {comments.map(c => (
                                <div
                                    key={c.id}
                                    style={{ animation:'slideUp .25s ease-out', marginBottom:6, display:'flex', alignItems:'flex-start', gap:6, position:'relative' }}
                                    onClick={(e) => { e.stopPropagation(); setCommentMenu(commentMenu === c.id ? null : c.id); }}
                                >
                                    <span style={{ color:'#00CFFF', fontWeight:700, fontSize:13, whiteSpace:'nowrap', flexShrink:0, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis' }}>{c.author_name}</span>
                                    <span style={{ color:'white', fontSize:13, lineHeight:1.4, flex:1, wordBreak:'break-word', overflowWrap:'anywhere' }}>{c.text}</span>
                                    {/* #18/#19: Comment actions (broadcaster only) */}
                                    {commentMenu === c.id && (
                                        <div style={{ display:'flex', gap:4, flexShrink:0, alignItems:'center' }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setPinnedComment(c); setCommentMenu(null); liveStreamService.pinComment(streamId, c.id).catch(() => {}); }}
                                                title="Pin comment"
                                                style={{ background:'rgba(255,215,0,0.3)', border:'none', color:'#FFD700', fontSize:11, padding:'3px 7px', borderRadius:6, cursor:'pointer', fontWeight:700 }}
                                            >Pin</button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setComments(prev => prev.filter(x => x.id !== c.id)); setCommentMenu(null); liveStreamService.deleteComment(c.id).catch(() => {}); }}
                                                title="Delete comment"
                                                style={{ background:'rgba(250,56,62,0.3)', border:'none', color:'#FA383E', fontSize:11, padding:'3px 7px', borderRadius:6, cursor:'pointer', fontWeight:700 }}
                                            >Del</button>
                                            {c.user_id !== user?.id && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); liveStreamService.banUser(streamId, c.user_id).catch(() => {}); setCommentMenu(null); setComments(prev => prev.filter(x => x.user_id !== c.user_id)); }}
                                                    title="Ban user"
                                                    style={{ background:'rgba(250,56,62,0.5)', border:'none', color:'white', fontSize:11, padding:'3px 7px', borderRadius:6, cursor:'pointer', fontWeight:700 }}
                                                >Ban</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={commentsEndRef} />
                        </div>

                        {/* COMMENT INPUT */}
                        <div style={{ position:'absolute', bottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 16px))', left:12, right:56, zIndex:10, display:'flex', gap:8 }}>
                            <input
                                ref={commentInputRef}
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
                            {/* Share button */}
                            <button
                                onClick={e => { e.stopPropagation(); handleShare(); }}
                                title="Share stream link"
                                style={{
                                    width:44, height:44, borderRadius:'50%', border:'none',
                                    background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)',
                                    color:'white', fontSize:20, cursor:'pointer', display:'flex',
                                    alignItems:'center', justifyContent:'center',
                                }}
                            >📤</button>
                            {guestInviteCode && (
                                <button
                                    onClick={e => { 
                                        e.stopPropagation(); 
                                        setGuestInviteModalOpen(true);
                                    }}
                                    title="Invite Guest to Stream"
                                    style={{
                                        width:44, height:44, borderRadius:'50%', border:'1px solid rgba(0, 102, 255, 0.5)',
                                        background:'rgba(0,102,255,0.2)', backdropFilter:'blur(8px)',
                                        color:'#00CFFF', fontSize:20, cursor:'pointer', display:'flex',
                                        alignItems:'center', justifyContent:'center',
                                    }}
                                >👥</button>
                            )}
                            {/* Mic mute/unmute */}
                            <button
                                onClick={e => { e.stopPropagation(); handleToggleMute(); }}
                                title={isMuted ? 'Unmute mic' : 'Mute mic'}
                                style={{
                                    width:44, height:44, borderRadius:'50%', border:'none',
                                    background: isMuted ? 'rgba(250,56,62,0.7)' : 'rgba(0,0,0,0.6)',
                                    backdropFilter:'blur(8px)',
                                    color:'white', fontSize:18, cursor:'pointer', display:'flex',
                                    alignItems:'center', justifyContent:'center',
                                }}
                            >{isMuted ? '🔇' : '🎙️'}</button>
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

                        {/* BUG FIX (GLM-3): use dedicated shareToast state, not error state */}
                        {shareToast && (
                            <div style={{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', background:'rgba(0,200,100,0.9)', color:'white', padding:'8px 20px', borderRadius:20, fontSize:13, fontWeight:600, zIndex:30 }}>
                                {shareToast}
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
                            {guestMode ? 'Join as Guest' : 'Start Live Stream'}
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
