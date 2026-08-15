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
import { getAccessToken, getFreshAccessToken } from '../../lib/authUtils';
import Lottie from 'lottie-react';
import diamondAnimation from '../../../public/diamond-animation.json';
import useStreamingViewportLock from '../../lib/useStreamingViewportLock';

const C = {
  red: '#FA383E',
  blue: '#0066FF',
};

const COMMENTS_PER_PAGE = 50;

// BUG-FIX-DEEP-AUDIT-R4 LSV-14: cap the local comments buffer. Realtime
// INSERTs used to append unboundedly; on a popular stream with 100
// comments/sec, the array grew to thousands of nodes and React's diff
// for the comments list became visibly laggy after ~10 minutes. Once
// the buffer exceeds this cap, drop the oldest entries. The user can
// still pull older comments via loadMoreComments (which uses
// `oldest.created_at` cursor — works fine even after trimming).
const MAX_COMMENT_BUFFER = COMMENTS_PER_PAGE * 4; // 200

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
  const [audioBlocked, setAudioBlocked] = useState(false); // 2026-08-15 audit: autoplay-blocked audio
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState('excellent');
  const [error, setError] = useState('');
  const [commentError, setCommentError] = useState('');
  const [comments, setComments] = useState([]);
  const [chatExpanded, setChatExpanded] = useState(false); // Bug21: collapsed by default, tap overlay to expand
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  // BUG-FIX-THEATER: sync isTheaterMode when user exits fullscreen via browser chrome
  // Without this, ✕ gets stuck and calling exitFullscreen() on a non-fullscreen doc throws
  const [shareToast, setShareToast] = useState('');
  const shareToastTimerRef = useRef(null);
  // BUG-FIX-LIVE-LIST-7: 3-option share menu (Copy / Native / Post to feed)
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [sharingToFeed, setSharingToFeed] = useState(false);
  // BUG-FIX-LIVE-7: track currently-selected video tier so the menu shows a
  // checkmark + the trigger button labels the active selection ("Quality · low").
  const [activeQuality, setActiveQuality] = useState('auto');
  const [commentInput, setCommentInput] = useState('');
  const [showViewerList, setShowViewerList] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [userDiamondBalance, setUserDiamondBalance] = useState(0);
  const [giftFlash, setGiftFlash] = useState(null);
  const [topGifters, setTopGifters] = useState({}); // Feature 5: Top Supporters — keyed by user_id, value is { name, amount, avatar }
  // Leaderboard is hidden until a gift arrives during this session, then auto-hides
  // 20 seconds after the last gift so it does not permanently obscure the stream.
  const [topGiftersVisible, setTopGiftersVisible] = useState(false);
  const topGiftersHideTimerRef = useRef(null);
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
  // BUG-FIX-DEEP-AUDIT-R4 LSV-10: clip-buffering is now opt-in.
  // Previously a MediaRecorder started passively on EVERY viewer
  // session, recording the remote broadcaster's stream continuously
  // (last 60s sliding window) without user consent, without any UI
  // indicator, even for anonymous viewers. That's a privacy issue
  // (recording someone else's content silently) AND a battery/CPU hit
  // on mobile. The user now explicitly arms the buffer with the
  // "Enable Clip" toggle; nothing is recorded until they do.
  const [clipBufferArmed, setClipBufferArmed] = useState(false);
  const [participants, setParticipants] = useState([]); // FEATURE 6: Split-screen state
  // BUG FIX (L7): track the active giftFlash timer so a new gift arrival
  // cancels the previous one instead of racing to clear the display.
  const giftFlashTimerRef = useRef(null);
  // BUG FIX (LV-1): track commentError clear timer to cancel on unmount
  const commentErrorTimerRef = useRef(null);
  // BUG FIX (V5): track the onStreamEnded close timer so unmount can cancel it
  const streamEndedTimerRef = useRef(null);

  useEffect(() => {
    // BUG-HUNT-3: previously bailed on `!userId` — anon viewers never
    // reached connect(), defeating the PR #294 anon-viewer-token work.
    // Now: gate user-specific lookups (blocklist, follow status,
    // diamond balance) behind userId, but always run connect().
    if (!stream?.id) return;
    const isAnon = !userId;

    if (!isAnon) {
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
          (outBlocks.data || []).forEach((r) => r.blocked_id && set.add(r.blocked_id));
          (inBlocks.data || []).forEach((r) => r.blocker_id && set.add(r.blocker_id));
          blockedSetRef.current = set;
        } catch (err) {
          console.warn('[Viewer] block-set prefetch failed:', err?.message || err);
        }
      })();
    }

    // Fetch historical gifts for leaderboard (public read, anon-safe).
    // Use the `leaderboard` array (keyed by user_id with display names)
    // rather than the legacy `topGifters` name→amount map so we always
    // show the real display name, never a UUID.
    fetch(`/api/live/gifts?stream_id=${stream.id}`)
      .then((res) => res.json())
      .then((data) => {
        const source = data.leaderboard || [];
        if (source.length > 0) {
          const byUser = {};
          source.forEach((r) => {
            byUser[r.user_id] = { name: r.name, amount: r.amount, avatar: r.avatar_url || null };
          });
          setTopGifters(byUser);
          // Historical leaderboard is loaded silently; the widget only
          // becomes visible when a live gift arrives this session.
        }
      })
      .catch((err) => console.error('Failed to load gifts', err));

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

        // Join the stream — joinStream tolerates userId=null
        // (gates the live_viewers upsert internally).
        const freshStream = await liveStreamService.joinStream(
          stream.id,
          userId,
          (remoteMediaStream) => {
            // BUG FIX (LSV-1): store in ref first, then state. The video element
            // may not be in the DOM yet when this callback fires (if the connecting
            // overlay is still showing). The useEffect below assigns srcObject after
            // the video element is guaranteed to be present.
            pendingStreamRef.current = remoteMediaStream;
            setRemoteStream(remoteMediaStream);
            setIsConnecting(false);
          }
        );

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
        // 2026-08-15 audit: reflect autoplay-blocked audio so the viewer can
        // render a "Tap for sound" button (iOS Safari / deep-link joins).
        liveStreamService.onAudioPlaybackChanged = (blocked) => setAudioBlocked(!!blocked);
        setTimeout(() => { try { setAudioBlocked(liveStreamService.audioBlocked); } catch (_) {} }, 1500);
        // Update streamData with the full DB response (includes broadcaster profile)
        if (freshStream) setStreamData(freshStream);

        // Don't set isConnecting false here — let the remoteStream callback do it
        // so we don't show a blank video before the track is ready.

        // Load diamond balance for gift panel (auth users only — anons can't gift)
        if (userId) {
          supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .maybeSingle()
            .then(({ data }) => {
              if (data) setUserDiamondBalance(data.diamonds || 0);
            });
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
      supabase
        .from('social_follows')
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
      supabase
        .rpc('get_visible_live_comments', {
          p_stream_id: stream.id,
          p_limit: COMMENTS_PER_PAGE,
          p_before: null,
        })
        .then(({ data, error }) => {
          if (error) {
            // RPC missing (dev/older env) — fall back to unfiltered SELECT
            if (error.code === 'PGRST202' || error.message?.includes('not exist')) {
              return supabase
                .from('live_comments')
                .select('*')
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
      const ch = supabase
        .channel(`live-comments-viewer-${stream.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'live_comments',
            filter: `stream_id=eq.${stream.id}`,
          },
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
            setComments((prev) => {
              // BUG FIX (LSV-5): Deduplicate by exact DB ID. If handleSendComment API
              // responded first, the exact row is already here. Don't add it twice.
              if (prev.some((c) => c.id === payload.new.id)) return prev;

              const hasOptimistic = prev.some(
                (c) =>
                  c.id?.toString().startsWith('optimistic-') &&
                  c.user_id === payload.new.user_id &&
                  c.text === payload.new.text
              );
              if (hasOptimistic) {
                // Replace the optimistic placeholder with the real DB row
                return prev.map((c) =>
                  c.id?.toString().startsWith('optimistic-') &&
                  c.user_id === payload.new.user_id &&
                  c.text === payload.new.text
                    ? payload.new
                    : c
                );
              }
              // BUG-FIX-DEEP-AUDIT-R4 LSV-14: cap buffer.
              // Drop oldest when over MAX_COMMENT_BUFFER.
              const next = [...prev, payload.new];
              return next.length > MAX_COMMENT_BUFFER
                ? next.slice(next.length - MAX_COMMENT_BUFFER)
                : next;
            });
          }
        )
        // BUG FIX (LSV-6): Handle DELETE events — broadcaster deletes propagate to
        // all viewer screens. Previously, deleted comments were permanently visible.
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'live_comments',
            filter: `stream_id=eq.${stream.id}`,
          },
          (payload) => {
            setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
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
      giftCh
        .on('broadcast', { event: 'gift' }, ({ payload }) => {
          if (payload?.sender_name && payload?.amount) {
            // BUG FIX (L7): cancel the previous flash timer before starting a new one.
            // Without this, rapid gifts cause the first timer to clear the second gift.
            if (giftFlashTimerRef.current) clearTimeout(giftFlashTimerRef.current);
            setGiftFlash({
              name: payload.sender_name,
              amount: payload.amount,
              avatar: payload.sender_avatar,
            });
            giftFlashTimerRef.current = setTimeout(() => {
              giftFlashTimerRef.current = null;
              setGiftFlash(null);
            }, 4000);

            // Feature 5: Update Top Gifters Leaderboard
            //
            // BUG-FIX-DEEP-AUDIT-R4 LSV-13: aggregate by sender_id
            // rather than sender_name. Two gifters with the same
            // display name were previously fused into one row,
            // contradicting the server-side /api/live/gifts
            // endpoint which (post round-2 G-1) aggregates by
            // user_id. The legacy `topGifters` shape is an
            // object keyed by name and used elsewhere in this
            // file, so we keep it but only fall back to name
            // when sender_id is absent. Newer streams will all
            // have sender_id present.
            // Update leaderboard keyed by user_id (falls back to sender_name
            // for legacy events without a sender_id, but modern events always
            // include it so UUIDs never appear as display names).
            setTopGifters((prev) => {
              const key = payload.sender_id || payload.sender_name;
              const existing = prev[key] || {
                name: payload.sender_name,
                avatar: payload.sender_avatar || null,
                amount: 0,
              };
              return { ...prev, [key]: { ...existing, amount: existing.amount + payload.amount } };
            });
            // Show leaderboard and (re-)start the 20-second auto-hide countdown.
            setTopGiftersVisible(true);
            if (topGiftersHideTimerRef.current) clearTimeout(topGiftersHideTimerRef.current);
            topGiftersHideTimerRef.current = setTimeout(() => {
              topGiftersHideTimerRef.current = null;
              setTopGiftersVisible(false);
            }, 20000);
          }
        })
        .subscribe();
      giftChannelRef.current = giftCh;
    }

    // #18: Subscribe to pinned comments
    if (stream?.id) {
      const pinCh = supabase
        .channel(`live-pins-${stream.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'live_pins',
            filter: `stream_id=eq.${stream.id}`,
          },
          async (payload) => {
            if (payload.eventType === 'DELETE') {
              setPinnedComment(null);
              return;
            }
            if (payload.new?.comment_id) {
              const { data: comment } = await supabase
                .from('live_comments')
                .select('*')
                .eq('id', payload.new.comment_id)
                .maybeSingle();
              // BUG-FIX-DEEP-AUDIT-R4 LSV-9: pinned comment
              // must respect blocklist. Without this, a
              // broadcaster could pin a comment from a user
              // who blocked this viewer (or whom this viewer
              // blocked) and the comment would appear in the
              // pinned slot, bypassing the realtime/insert
              // and initial-load block filtering.
              if (comment && !blockedSetRef.current?.has(comment.user_id)) {
                setPinnedComment(comment);
              } else {
                setPinnedComment(null);
              }
            }
          }
        )
        .subscribe();
      pinChannelRef.current = pinCh;

      // Also fetch existing pinned comment
      supabase
        .from('live_pins')
        .select('comment_id')
        .eq('stream_id', stream.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(async ({ data: pin }) => {
          if (pin?.comment_id) {
            const { data: comment } = await supabase
              .from('live_comments')
              .select('*')
              .eq('id', pin.comment_id)
              .maybeSingle();
            // BUG-FIX-DEEP-AUDIT-R4 LSV-9: same blocklist
            // guard on initial-load path. blockedSetRef is
            // populated by the pre-fetch above; if it
            // hasn't resolved yet (race on slow networks),
            // the Set is empty so we permissively show the
            // pin. Real-time INSERT will correct it once
            // the block-set lands.
            if (comment && !blockedSetRef.current?.has(comment.user_id)) {
              setPinnedComment(comment);
            }
          }
        });
    }

    return () => {
      // 2026-08-15 audit: every unmount path except the X button skipped
      // leaveStream(), leaving a zombie live_viewers row, a connected LiveKit
      // room eating media, and a ghost "WATCHING" PiP for an ended stream.
      // leaveStream() is idempotent (no-ops when already disconnected).
      if (!liveStreamService.isBroadcaster && liveStreamService.room) {
        liveStreamService.leaveStream().catch(() => {});
      }
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
      // BUG-FIX-AUDIT LSV-A1: null the participants callback on cleanup.
      // Without this, a post-unmount LiveKit participant update calls
      // setParticipants() on an unmounted component.
      liveStreamService.onParticipantsUpdate = null;
      // BUG-FIX-AUDIT LSV-A2: clear the top-gifters auto-hide timer on cleanup.
      // Without this, a gift arriving within 20 seconds of the viewer leaving
      // fires setTopGiftersVisible(false) on an unmounted component.
      if (topGiftersHideTimerRef.current) {
        clearTimeout(topGiftersHideTimerRef.current);
        topGiftersHideTimerRef.current = null;
      }
    };
  }, [stream?.id, userId]);

  // Host video binding from LiveKit participants
  useEffect(() => {
    if (!videoRef.current || !stream?.broadcaster_id) return;
    const hostParticipant = participants.find(
      (p) => String(p.identity) === String(stream.broadcaster_id)
    );
    if (hostParticipant) {
      const pubs = Array.from(hostParticipant.videoTrackPublications.values());
      const videoPub = pubs.find((pub) => pub.track);
      if (videoPub?.track) {
        try {
          videoPub.track.attach(videoRef.current);
        } catch (e) {}
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
      // BUG-FIX-DEEP-AUDIT-R4 LSV-10: do NOT auto-start MediaRecorder
      // here. The clip-buffer is now opt-in (see clipBufferArmed
      // effect below). Previously every viewer recorded the remote
      // stream continuously without consent.
      pendingStreamRef.current = null;
    }
  }, [isConnecting]);

  // BUG-FIX-DEEP-AUDIT-R4 LSV-10: clip-buffer driven by clipBufferArmed.
  // When the user toggles "Enable Clip" on, this effect starts a
  // MediaRecorder against the current remote stream and maintains a
  // ~60s sliding window of chunks. When the user toggles it off (or
  // the component unmounts, or the stream changes), the recorder is
  // stopped and the buffer cleared.
  useEffect(() => {
    if (!clipBufferArmed) return;
    // BUG-FIX-DEEP-AUDIT-R4 LSV-11: anon viewers can't save clips
    // because storage RLS requires auth.uid() in the path. Refuse
    // to even start the buffer in that case — cleaner than
    // recording 60s then erroring on upload.
    if (!userId) {
      setClipBufferArmed(false);
      return;
    }
    const stream = remoteStream || pendingStreamRef.current;
    if (!stream) return;

    let recorder = null;
    try {
      recordedChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          // Keep only the last ~60s (1 chunk/sec).
          if (recordedChunksRef.current.length > 60) {
            recordedChunksRef.current.shift();
          }
        }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.warn('[ClipIt] Failed to start MediaRecorder:', err);
      setClipBufferArmed(false);
      return;
    }

    return () => {
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch (_) {}
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
    };
  }, [clipBufferArmed, remoteStream, userId]);

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
    // BUG-FIX-DEEP-AUDIT-R4 LSV-11: anon viewers cannot save clips
    // (storage RLS requires auth.uid() in path). The button should
    // be disabled in the UI for anon, but defend the handler too.
    if (!userId) {
      setShareToast('Sign in to save clips');
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      shareToastTimerRef.current = setTimeout(() => setShareToast(''), 2500);
      return;
    }
    // BUG-FIX-DEEP-AUDIT-R4 LSV-10: explicit guard for the case where
    // the user hits Clip It before arming the buffer. Tells them what
    // to do rather than silently doing nothing.
    if (!mediaRecorderRef.current || recordedChunksRef.current.length === 0) {
      setShareToast(
        clipBufferArmed
          ? 'Buffer still filling — try again in a moment'
          : 'Enable Clip first to start buffering'
      );
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      shareToastTimerRef.current = setTimeout(() => setShareToast(''), 2500);
      return;
    }
    if (isClipping) return;
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
      setShareToast('Failed to create clip');
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      shareToastTimerRef.current = setTimeout(() => setShareToast(''), 2500);
    } finally {
      setIsClipping(false);
    }
  };

  // Feature 1: PiP Mode Handler
  const togglePiP = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    try {
      // BUG-FIX-LIVE-LIST-4: iOS Safari path. The standard
      // pictureInPictureEnabled is false on iOS but webkit-prefixed PiP
      // works via webkitSupportsPresentationMode + webkitSetPresentationMode.
      if (
        typeof v.webkitSupportsPresentationMode === 'function' &&
        v.webkitSupportsPresentationMode('picture-in-picture')
      ) {
        if (v.webkitPresentationMode === 'picture-in-picture') {
          v.webkitSetPresentationMode('inline');
          setIsPiP(false);
        } else {
          // Ensure video is playing (iOS rejects PiP for paused videos)
          try {
            await v.play();
          } catch (_) {}
          v.webkitSetPresentationMode('picture-in-picture');
          setIsPiP(true);
        }
        return;
      }
      // Standard API path (Chrome, Firefox, desktop Safari 13.4+)
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else if (document.pictureInPictureEnabled) {
        try {
          await v.play();
        } catch (_) {}
        await v.requestPictureInPicture();
        setIsPiP(true);
      } else {
        throw new Error('PiP not supported by this browser');
      }
    } catch (err) {
      console.warn('[PiP] Error:', err);
      setError('Picture-in-picture failed: ' + (err?.message || 'unknown'));
      setTimeout(() => setError(''), 2500);
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

  // BUG-FIX-LIVE-LIST-7: close share menu on outside click or Escape
  useEffect(() => {
    if (!showShareMenu) return;
    const onDocClick = (e) => {
      // Any click that wasn't inside the menu (the menu stops propagation
      // on its container) closes it.
      setShowShareMenu(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setShowShareMenu(false);
    };
    // Wait one tick so the click that OPENED the menu doesn't immediately close it
    const id = setTimeout(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showShareMenu]);

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
          const fb = await supabase
            .from('live_comments')
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
        setComments((prev) => [...reversed, ...prev]);
        setHasMoreComments(rows.length === COMMENTS_PER_PAGE);
      }
    } catch (err) {
      console.warn('[Viewer] loadMore comments error:', err);
    }
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
    const localDisplayName =
      user?.username ||
      user?.user_metadata?.preferred_username ||
      user?.full_name ||
      user?.user_metadata?.full_name ||
      user?.email?.split('@')[0] ||
      'Viewer';
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticComment = {
      id: optimisticId,
      stream_id: stream.id,
      user_id: userId,
      author_name: localDisplayName,
      text,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimisticComment]);
    try {
      // BUG-FIX-7: use getFreshAccessToken() instead of getAccessToken(). On
      // long live streams (1h+), the JWT expires and subsequent comment POSTs
      // return 401. Each failed attempt sets commentError, which clears after
      // 3s, but if the user retries before 3s the old timer fires and clears
      // the new error — causing the "error repeats" symptom. Using a fresh
      // token prevents the 401 loop entirely.
      const token = (await getFreshAccessToken()) || getAccessToken();
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
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));
        setCommentError(json.error || 'Comment failed');
        // BUG FIX (LV-1): track timer ref to prevent setState on unmounted component
        if (commentErrorTimerRef.current) clearTimeout(commentErrorTimerRef.current);
        commentErrorTimerRef.current = setTimeout(() => {
          commentErrorTimerRef.current = null;
          setCommentError('');
        }, 3000);
      } else if (json.comment) {
        // Replace optimistic comment with real DB row (has server-resolved author_name)
        setComments((prev) => prev.map((c) => (c.id === optimisticId ? json.comment : c)));
      }
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
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
    // BUG-FIX-LIVE-LIST-3: never block the close. If leaveStream() hangs
    // (e.g. LiveKit room stuck in transient state after a fullscreen
    // error), the user must still be able to exit. Race the leaveStream
    // promise against a 3s safety timer so onClose() ALWAYS runs in
    // bounded time.
    try {
      liveStreamService.isManualDisconnect = true;
      // Also exit fullscreen if we got stuck inside it.
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        try {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch (_) {}
      }
      await Promise.race([
        liveStreamService.leaveStream(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (err) {
      console.error('[LiveStreamViewer] Failed to cleanly leave stream:', err);
    } finally {
      // BUG-FIX-13: explicitly null currentStreamId so GlobalPiPManager
      // stops polling and the PiP widget doesn't reappear when the user
      // navigates to their profile after watching a stream.
      // 2026-08-15 audit: when the 3s race timer won, the Room reference was
      // dropped while still connected — the viewer stayed a LiveKit
      // participant forever and inflated the broadcaster's viewer count.
      // Capture and disconnect explicitly before dropping the handle.
      const straggler = liveStreamService.room;
      liveStreamService.currentStreamId = null;
      liveStreamService.room = null;
      if (straggler) { try { straggler.disconnect(); } catch (_) {} }
      busEmit.dataMutated?.('live_streams');
      onClose();
    }
  };

  const qualityColor =
    connectionQuality === 'excellent' || connectionQuality === 'good'
      ? '#42B72A'
      : connectionQuality === 'poor'
        ? '#FFA500'
        : '#FA383E';

  return (
    <div
      data-viewer-root
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 9999,
        display: 'flex',
        flexDirection: isTheaterMode ? 'row' : 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Video Container - Split Screen Logic */}
        {(() => {
          // Compute guests with active video tracks before rendering so we can
          // conditionally switch the host video between absolute-fill (solo) and
          // flex-item (split) mode. When the host video is position:absolute it
          // is removed from the flex flow, making the guest the sole flex item
          // and giving it 100% of the container — the root cause of Bug 7.
          const guestParticipants = participants.filter((p) => {
            if (String(p.identity) === String(stream?.broadcaster_id)) return false;
            return Array.from(p.videoTrackPublications.values()).some((pub) => pub.track);
          });
          const hasGuests = guestParticipants.length > 0;
          return (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: isTheaterMode ? 'row' : 'column',
                background: '#000',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  try {
                    e.currentTarget.play?.();
                  } catch (_) {}
                }}
                style={
                  hasGuests
                    ? {
                        // Split mode: host is a flex item so both host and guest
                        // receive an equal share of the container (50/50).
                        flex: 1,
                        minHeight: 0,
                        minWidth: 0,
                        width: '100%',
                        objectFit: 'cover',
                        transition: 'all 0.3s ease',
                      }
                    : {
                        // Solo mode: absolute fill so the broadcaster's portrait
                        // video fills the viewport edge-to-edge without letterboxing.
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'all 0.3s ease',
                      }
                }
              />

              {/* Guest participants — each gets an equal flex share */}
              {guestParticipants.map((p) => {
                const pubs = Array.from(p.videoTrackPublications.values());
                const videoPub = pubs.find((pub) => pub.track);
                if (!videoPub) return null;
                return (
                  <div
                    key={p.identity}
                    style={{
                      flex: 1,
                      minHeight: 0,
                      minWidth: 0,
                      position: 'relative',
                      width: '100%',
                    }}
                  >
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={(el) => {
                        if (el) {
                          try {
                            videoPub.track.attach(el);
                          } catch (e) {}
                        }
                      }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        background: 'rgba(0,0,0,0.6)',
                        padding: '4px 8px',
                        borderRadius: 4,
                        color: 'white',
                        fontSize: 12,
                      }}
                    >
                      {p.name || 'Guest'}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

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
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '4px solid rgba(255,255,255,0.2)',
                borderTopColor: '#0066FF',
                animation: 'spin 0.8s linear infinite',
                marginBottom: 16,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            />
            <div style={{ fontSize: 18, fontWeight: 500 }}>
              {isReconnecting ? 'Reconnecting...' : 'Connecting To Stream...'}
            </div>
          </div>
        )}

        {/* 2026-08-15 audit: autoplay-blocked audio (iOS Safari / deep-link joins)
            — a real user gesture is required to unblock LiveKit audio. */}
        {audioBlocked && !isConnecting && (
          <button
            onClick={async () => {
              const ok = await liveStreamService.startAudio();
              if (ok) setAudioBlocked(false);
            }}
            style={{
              position: 'absolute',
              bottom: 96,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 40,
              background: '#0066FF',
              color: 'white',
              border: 'none',
              borderRadius: 24,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            🔊 Tap for sound
          </button>
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
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: 'white',
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleLeave}
                style={{
                  background: '#FA383E',
                  border: 'none',
                  color: 'white',
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Leave Stream
              </button>
            </div>
          </div>
        )}

        {/* Feature 2: Gift flash animation with Lottie */}
        {giftFlash && (
          <div
            style={{
              position: 'absolute',
              top: '35%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 25,
              animation: 'giftPop 0.5s ease-out',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ width: 150, height: 150, margin: '0 auto' }}>
              <Lottie animationData={diamondAnimation} loop={false} />
            </div>
            <div
              style={{
                color: 'white',
                fontSize: 20,
                fontWeight: 800,
                textShadow: '0 2px 12px rgba(0,0,0,.8)',
              }}
            >
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

          {/* BUG-FIX-LIVE-LIST-7: Share menu — 3 explicit actions
                    so watchers can copy a link, use native OS share, OR
                    post the live stream to their own feed. Previously this
                    button silently picked one based on browser support. */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowShareMenu((prev) => !prev)}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
                border: 'none',
                color: 'white',
                fontSize: 20,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Share stream"
              aria-label="Share stream"
              aria-haspopup="menu"
              aria-expanded={showShareMenu}
            >
              📤
            </button>
            {showShareMenu && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: 50,
                  right: 0,
                  background: 'rgba(20, 22, 28, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: 6,
                  minWidth: 200,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                  zIndex: 70,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Copy Link */}
                <button
                  onClick={async () => {
                    const streamUrl = `${window.location.origin}/hub/social-media?stream=${stream?.id}`;
                    try {
                      await navigator.clipboard.writeText(streamUrl);
                      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                      setShareToast('Link copied to clipboard');
                      shareToastTimerRef.current = setTimeout(() => {
                        shareToastTimerRef.current = null;
                        setShareToast('');
                      }, 2500);
                    } catch (err) {
                      setShareToast('Copy failed — try sharing instead');
                      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                      shareToastTimerRef.current = setTimeout(() => {
                        shareToastTimerRef.current = null;
                        setShareToast('');
                      }, 2500);
                    }
                    setShowShareMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                    borderRadius: 8,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 18 }}>🔗</span>
                  <span>Copy Link</span>
                </button>

                {/* Native Share (mobile) */}
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                  <button
                    onClick={async () => {
                      const streamUrl = `${window.location.origin}/hub/social-media?stream=${stream?.id}`;
                      try {
                        await navigator.share({
                          title: streamData?.title || 'Live Stream on Smarter.Poker',
                          text: 'Watch this live stream',
                          url: streamUrl,
                        });
                      } catch (_) {
                        /* user cancelled — silent */
                      }
                      setShowShareMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: '10px 14px',
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 8,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 18 }}>📲</span>
                    <span>Share to apps...</span>
                  </button>
                )}

                {/* Post to my feed */}
                <button
                  disabled={sharingToFeed || !stream?.id}
                  onClick={async () => {
                    if (sharingToFeed || !stream?.id) return;
                    if (!userId) {
                      setShowShareMenu(false);
                      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                      setShareToast('Sign in to share to your feed');
                      shareToastTimerRef.current = setTimeout(() => { shareToastTimerRef.current = null; setShareToast(''); }, 2500);
                      return;
                    }
                    setSharingToFeed(true);
                    try {
                      // fresh token — a cached JWT expires on long streams and 401s
                      const token = (await getFreshAccessToken()) || getAccessToken();
                      const resp = await fetch('/api/live/share-stream-to-feed', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        credentials: 'same-origin',
                        body: JSON.stringify({ stream_id: stream.id }),
                      });
                      const data = await resp.json().catch(() => ({}));
                      if (resp.ok) {
                        if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                        setShareToast(
                          data.already_shared
                            ? 'Already shared to your feed'
                            : 'Posted to your feed'
                        );
                        shareToastTimerRef.current = setTimeout(() => {
                          shareToastTimerRef.current = null;
                          setShareToast('');
                        }, 2500);
                      } else {
                        if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                        setShareToast(data.error || 'Could not share — please try again');
                        shareToastTimerRef.current = setTimeout(() => {
                          shareToastTimerRef.current = null;
                          setShareToast('');
                        }, 2500);
                      }
                    } catch (err) {
                      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                      setShareToast('Could not share — network error');
                      shareToastTimerRef.current = setTimeout(() => {
                        shareToastTimerRef.current = null;
                        setShareToast('');
                      }, 2500);
                    } finally {
                      setSharingToFeed(false);
                      setShowShareMenu(false);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: sharingToFeed ? 'rgba(255,255,255,0.5)' : 'white',
                    fontSize: 14,
                    cursor: sharingToFeed ? 'wait' : 'pointer',
                    textAlign: 'left',
                    borderRadius: 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!sharingToFeed) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 18 }}>📰</span>
                  <span>{sharingToFeed ? 'Posting...' : 'Post to my feed'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Share toast */}
          {shareToast && (
            <div
              style={{
                position: 'absolute',
                top: 60,
                left: 12,
                background: 'rgba(0,200,100,0.9)',
                color: 'white',
                padding: '6px 16px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {shareToast}
            </div>
          )}

          {/* Feature 3: Clip It —
                    BUG-FIX-DEEP-AUDIT-R4 LSV-10 / LSV-11: two-state UX
                    so the user explicitly opts into clip buffering
                    (which is a continuous MediaRecorder against the
                    remote stream). Anon viewers see a sign-in hint
                    instead. */}
          <div
            style={{
              position: 'absolute',
              bottom: 120,
              right: 16,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: 'flex-end',
            }}
          >
            {!userId ? (
              <button
                disabled
                title="Sign in to save clips"
                style={{
                  background: 'rgba(120,120,120,0.6)',
                  border: 'none',
                  color: 'white',
                  padding: '8px 14px',
                  borderRadius: 8,
                  cursor: 'not-allowed',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: 0.7,
                }}
              >
                ✂️ Sign in to clip
              </button>
            ) : (
              <>
                <button
                  onClick={() => setClipBufferArmed((v) => !v)}
                  title={
                    clipBufferArmed
                      ? 'Recording last 60s for clipping. Tap to stop.'
                      : 'Tap to start recording the last 60s of this stream so you can clip it.'
                  }
                  style={{
                    background: clipBufferArmed ? 'rgba(0,160,80,0.85)' : 'rgba(0,0,0,0.6)',
                    border: 'none',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {clipBufferArmed ? '● Buffering' : '○ Enable Clip'}
                </button>
                <button
                  onClick={handleClipIt}
                  disabled={isClipping || !clipBufferArmed}
                  style={{
                    background: 'rgba(250,56,62,0.85)',
                    border: 'none',
                    color: 'white',
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: isClipping || !clipBufferArmed ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 12px rgba(250,56,62,0.4)',
                    opacity: isClipping || !clipBufferArmed ? 0.6 : 1,
                  }}
                >
                  ✂️ {isClipping ? 'Clipping...' : 'Clip It'}
                </button>
              </>
            )}
          </div>

          {/* BUG-FIX-LIVE-7 (Quality / PiP / Theatre):
                    - Quality: tracks activeQuality, shows ✓ on selected tier,
                      labels the trigger ("Quality · low"). Toast confirmation.
                    - PiP: surfaces a clear error if the browser/element
                      doesn't support it; was previously console.warn-only.
                    - Theatre: actually requests fullscreen on the video
                      element (with iOS webkitEnterFullscreen fallback)
                      instead of just toggling flexDirection. */}
          <div
            style={{
              position: 'absolute',
              top: 70,
              right: 16,
              display: 'flex',
              gap: 8,
              zIndex: 20,
            }}
          >
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                style={{
                  background: 'rgba(0,0,0,.6)',
                  border: 'none',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Quality{activeQuality !== 'auto' ? ` · ${activeQuality}` : ''}
              </button>
              {showQualityMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: 32,
                    right: 0,
                    background: 'rgba(0,0,0,0.85)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    minWidth: 120,
                  }}
                >
                  {['auto', 'high', 'medium', 'low'].map((q) => (
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
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
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
                const v = videoRef.current;
                const standardSupported =
                  typeof document !== 'undefined' &&
                  document.pictureInPictureEnabled &&
                  !v.disablePictureInPicture;
                const iosSupported =
                  typeof v.webkitSupportsPresentationMode === 'function' &&
                  v.webkitSupportsPresentationMode('picture-in-picture');
                if (!standardSupported && !iosSupported) {
                  setError('Picture-in-picture is not supported on this browser');
                  setTimeout(() => setError(''), 3000);
                  return;
                }
                // Ensure video is playing
                try {
                  await v.play();
                } catch (_) {}
                await togglePiP();
              }}
              style={{
                background: isPiP ? 'rgba(0,120,255,0.7)' : 'rgba(0,0,0,.6)',
                border: 'none',
                color: 'white',
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              PiP
            </button>
            <button
              onClick={async () => {
                // BUG-FIX-LIVE-LIST-3: theater toggle hardening.
                // Source of truth = document.fullscreenElement, NOT
                // React state (which can desync if the user exits
                // fullscreen via browser chrome between renders).
                // After EVERY path (success or thrown), sync React
                // state to reality so the next tap behaves
                // correctly. Without this, a transient throw left
                // theater state stuck and locked the user out.
                const inFullscreen = !!(
                  document.fullscreenElement || document.webkitFullscreenElement
                );
                const viewerContainer =
                  videoRef.current?.closest('[data-viewer-root]') ||
                  videoRef.current?.parentElement?.parentElement?.parentElement?.parentElement;
                try {
                  if (!inFullscreen) {
                    if (viewerContainer?.requestFullscreen) {
                      await viewerContainer.requestFullscreen();
                    } else if (videoRef.current?.webkitEnterFullscreen) {
                      videoRef.current.webkitEnterFullscreen();
                    }
                  } else {
                    if (document.exitFullscreen) await document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                  }
                } catch (err) {
                  console.warn('[Theater] toggle failed:', err?.message || err);
                } finally {
                  // Sync state to reality regardless of whether the
                  // toggle succeeded. fullscreenchange listener will
                  // also fire if the API actually changed; this is
                  // a belt-and-suspenders so the UI is never locked.
                  const nowFullscreen = !!(
                    document.fullscreenElement || document.webkitFullscreenElement
                  );
                  setIsTheaterMode(nowFullscreen);
                }
              }}
              style={{
                background: isTheaterMode ? 'rgba(0,120,255,0.7)' : 'rgba(0,0,0,.6)',
                border: 'none',
                color: 'white',
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
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
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'white',
                  display: 'inline-block',
                }}
              />
              LIVE
            </div>
            {/* Connection quality dot */}
            <div
              title={`Connection: ${connectionQuality}`}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
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
              src={
                streamData?.broadcaster?.avatar_url ||
                streamData?.profiles?.avatar_url ||
                '/default-avatar.png'
              }
              alt={streamData?.broadcaster?.username || streamData?.profiles?.username}
              style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid white' }}
            />
            <div>
              <div style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>
                {streamData?.broadcaster?.username || streamData?.profiles?.username || 'Anonymous'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                {streamData?.category && streamData.category !== 'general'
                  ? streamData.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                  : 'Smarter.Poker'}
              </div>
            </div>
            {/* #7: Follow button */}
            {userId &&
              (streamData?.broadcaster_id || stream?.broadcaster_id) &&
              userId !== (streamData?.broadcaster_id || stream?.broadcaster_id) && (
                <button
                  onClick={async () => {
                    if (followLoading) return;
                    setFollowLoading(true);
                    try {
                      const broadcasterId = streamData?.broadcaster_id || stream?.broadcaster_id;
                      if (isFollowing) {
                        const { error } = await supabase
                          .from('social_follows')
                          .delete()
                          .eq('follower_id', userId)
                          .eq('following_id', broadcasterId);
                        if (error) throw error;
                        setIsFollowing(false);
                      } else {
                        const { error } = await supabase
                          .from('social_follows')
                          .upsert(
                            { follower_id: userId, following_id: broadcasterId },
                            { onConflict: 'follower_id,following_id' }
                          );
                        if (error) throw error;
                        setIsFollowing(true);
                      }
                    } catch (e) {
                      console.warn('Follow error:', e);
                    }
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
            <div style={{ color: 'white', fontSize: 15, lineHeight: 1.4 }}>{streamData.title}</div>
          )}
          {/* #9: Stream description */}
          {streamData?.description && (
            <div
              style={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: 13,
                lineHeight: 1.3,
                marginTop: 4,
              }}
            >
              {streamData.description}
            </div>
          )}
        </div>

        {/* #18: PINNED COMMENT (viewer side) */}
        {pinnedComment && (
          <div
            style={{
              position: 'absolute',
              bottom: 290,
              left: 12,
              right: 80,
              zIndex: 10,
              background: 'rgba(0,0,0,0.7)',
              borderRadius: 10,
              padding: '8px 12px',
              border: '1px solid rgba(255,215,0,0.3)',
            }}
          >
            <div style={{ color: '#FFD700', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
              PINNED
            </div>
            <span style={{ color: '#00CFFF', fontWeight: 700, fontSize: 12, marginRight: 6 }}>
              {pinnedComment.author_name || 'User'}
            </span>
            <span style={{ color: 'white', fontSize: 12 }}>{pinnedComment.text}</span>
          </div>
        )}

        {/* COMMENTS OVERLAY — Bug21: collapsed (last 5) by default, tap to expand */}
        <div
          onClick={() => setChatExpanded((e) => !e)}
          style={{
            position: 'absolute',
            bottom: 175,
            left: 0,
            width: 'min(320px,60vw)',
            maxHeight: chatExpanded ? 300 : 160,
            overflowY: chatExpanded ? 'auto' : 'hidden',
            padding: '0 12px',
            scrollbarWidth: 'none',
            zIndex: 5,
            cursor: 'pointer',
          }}
        >
          {/* Load more comments button — only shown when expanded */}
          {chatExpanded && hasMoreComments && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadMoreComments();
              }}
              disabled={loadingMoreComments}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px',
                marginBottom: 8,
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.6)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {loadingMoreComments ? 'Loading...' : 'Load Earlier Comments'}
            </button>
          )}
          {(chatExpanded ? comments : comments.slice(-5)).map((c, i) => (
            <div
              key={c.id || i}
              style={{ marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}
            >
              <span
                style={{
                  color: '#00CFFF',
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.author_name || 'User'}
              </span>
              <span
                style={{
                  color: 'white',
                  fontSize: 13,
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  flex: 1,
                }}
              >
                {c.text}
              </span>
            </div>
          ))}
          {!chatExpanded && comments.length > 5 && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>
              tap to see all {comments.length} messages
            </div>
          )}
          <div ref={commentsEndRef} />
        </div>

        {/* Slow mode / ban error */}
        {commentError && (
          <div
            style={{
              position: 'absolute',
              bottom: 65,
              left: 12,
              right: 12,
              background: 'rgba(250,56,62,0.9)',
              color: 'white',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              zIndex: 15,
            }}
          >
            {commentError}
          </div>
        )}

        {/* COMMENT INPUT + gift button */}
        <div
          style={{
            position: 'absolute',
            bottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 24px))',
            left: 12,
            right: 12,
            zIndex: 10,
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            ref={commentInputRef}
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendComment();
            }}
            // BUG FIX (LSV-4): if not authed, show a hint instead of silently failing
            placeholder={userId ? 'Say something...' : 'Sign in to chat...'}
            disabled={!userId}
            // Bug22: inputMode + enterKeyHint prevent iPad keyboard error on focus
            inputMode="text"
            enterKeyHint="send"
            // STREAM-BUG-12a: 16px minimum so iOS Safari does not auto-zoom on focus.
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 22,
              border: '1.5px solid rgba(255,255,255,.3)',
              background: userId ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.3)',
              color: 'white',
              fontSize: 16,
              outline: 'none',
              opacity: userId ? 1 : 0.6,
            }}
          />
          {/* Diamond gift button — BUG-HUNT-13: gate on userId truthy.
                    Previously `userId !== broadcaster_id` was true for anon
                    (undefined !== uuid) so the button showed but tapping
                    surfaced a 401. Hide it for anon. */}
          {userId &&
            (streamData?.broadcaster_id || stream?.broadcaster_id) &&
            (streamData?.broadcaster_id || stream?.broadcaster_id) !== userId && (
              <button
                onClick={() => setShowGifts(true)}
                // STREAM-BUG-9: strip yellow ring (was rgba(255,215,0,0.85)),
                // enlarge button + icon, black background per Dan.
                style={{
                  padding: '14px 16px',
                  borderRadius: 28,
                  border: 'none',
                  background: '#000000',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Send diamond gift"
                aria-label="Send diamond gift"
              >
                {/* STREAM-BUG-9 follow-up: 32px ≥ floating-reaction emoji (28px)
                            and 12px taller than the 20px reaction-button emoji glyphs. */}
                <img
                  src="/images/diamond.png"
                  alt=""
                  aria-hidden="true"
                  style={{ width: 32, height: 32, display: 'block' }}
                />
              </button>
            )}
          <button
            onClick={handleSendComment}
            disabled={!userId}
            style={{
              padding: '9px 16px',
              borderRadius: 22,
              border: 'none',
              background: userId ? 'rgba(0,120,255,.85)' : 'rgba(100,100,100,.6)',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              cursor: userId ? 'pointer' : 'not-allowed',
              opacity: userId ? 1 : 0.6,
            }}
          >
            Send
          </button>
        </div>

        {/* Emoji reactions */}
        <LiveReactions streamId={stream?.id} userId={userId} />

        {/* Feature 5: Top Supporters Leaderboard — visible for 20s after each gift */}
        {topGiftersVisible && Object.keys(topGifters).length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 120,
              right: 16,
              background: 'rgba(0,0,0,0.5)',
              padding: '10px 14px',
              borderRadius: 12,
              zIndex: 15,
              backdropFilter: 'blur(8px)',
              minWidth: 140,
            }}
          >
            {/* Bug23: dismiss button so the panel doesn't permanently block stream content */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#FFD700',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Top Supporters
              </div>
              <button
                onClick={() => setTopGiftersVisible(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: '0 0 0 8px',
                  lineHeight: 1,
                }}
                aria-label="Dismiss top supporters"
              >
                ✕
              </button>
            </div>
            {Object.entries(topGifters)
              .sort(([, a], [, b]) => b.amount - a.amount)
              .slice(0, 3)
              // BUG-FIX-AUDIT LSV-A3: renamed `userId` → `gifterId` to prevent
              // variable shadowing of the outer `userId` prop. Using the prop name
              // as a destructuring variable in a map callback silently shadows it —
              // any future code in this callback referencing `userId` would get the
              // gifter's uuid, not the viewer's id, causing subtle auth bugs.
              .map(([gifterId, { name, amount }], idx) => (
                <div
                  key={gifterId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    color: 'white',
                    marginBottom: 4,
                    alignItems: 'center',
                  }}
                >
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
        currentUser={user}
        inviteCode={streamData?.invite_code || stream?.invite_code || null}
        onClose={() => setShowViewerList(false)}
      />

      {/* Reconnect overlay */}
      {isReconnecting && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.2)',
              borderTopColor: '#0066FF',
              animation: 'spin 0.8s linear infinite',
              marginBottom: 16,
            }}
          />
          <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>Reconnecting...</div>
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
