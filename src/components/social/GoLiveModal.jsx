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
import { LiveViewerList } from './LiveViewerList';
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
  hasMediaPermissionGrant,
} from '../../lib/mediaStreamSingleton';
import StreamPreviewCapture from '../../lib/streamPreviewCapture';
import { getAccessToken } from '../../lib/authUtils';

const C = {
  bg: '#F0F2F5',
  card: '#FFFFFF',
  text: '#050505',
  textSec: '#65676B',
  border: '#DADDE1',
  red: '#FA383E',
  blue: '#0066FF',
};

// ═══════════════════════════════════════════════════════════════════════════
// GUEST INVITE MODAL — Select a friend and send them an invite via DM
// ═══════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: CohostPickerModal — pre-live co-host selection
// Dan: "ability to START with 2 people for the stream"
//
// Distinct from GuestInviteModal (which fires DURING the broadcast and needs
// the real guest_invite_code). This picker stages a friend BEFORE the stream
// is created. After startBroadcast lands the real invite code, GoLiveModal's
// handleGoLive auto-sends the messenger invite to the staged friend.
// ─────────────────────────────────────────────────────────────────────────────
function CohostPickerModal({ isOpen, onClose, currentUser, onPick }) {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const fetchFriends = async () => {
      setLoading(true);
      try {
        const { getAccessToken } = await import('../../lib/authUtils');
        const token = getAccessToken();
        const res = await fetch('/api/friends?action=list', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (json?.success) setFriends(json.data?.friends || []);
      } catch (err) {
        console.warn('[CohostPickerModal] fetch friends failed:', err?.message || err);
      }
      if (!cancelled) setLoading(false);
    };
    fetchFriends();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const q = search.trim().toLowerCase();
  const filtered = !q
    ? friends
    : friends.filter(
        (f) =>
          (f.display_name || '').toLowerCase().includes(q) ||
          (f.username || '').toLowerCase().includes(q)
      );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1C1E21',
          padding: 20,
          borderRadius: 16,
          width: '100%',
          maxWidth: 420,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700 }}>
              Invite a Co-Host
            </h3>
            <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>
              They'll get a messenger invite the instant you go live
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 22,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends..."
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#0f1012',
            color: '#fff',
            fontSize: 14,
            marginBottom: 12,
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {loading ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '30px 0' }}>
            Loading friends...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '30px 0', fontSize: 14 }}>
            {friends.length === 0 ? 'No friends yet — add some first.' : 'No matches.'}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  onPick(f);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #2a2a2a',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#252628')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: f.avatar_url
                      ? `url(${f.avatar_url}) center/cover`
                      : 'linear-gradient(135deg, #FA383E, #FFA500)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.display_name || f.username}
                  </div>
                  {f.username && f.display_name && (
                    <div
                      style={{
                        color: '#aaa',
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      @{f.username}
                    </div>
                  )}
                </div>
                <div style={{ color: '#1877F2', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  Pick →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GuestInviteModal({ isOpen, onClose, streamId, inviteCode, currentUser }) {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState(null);
  // Bug24: search-first UX — don't dump the full friends list on open
  const [guestSearch, setGuestSearch] = useState('');

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

      // FIX (LIVE-INVITE-1): the previous implementation called a Supabase
      // RPC `fn_get_or_create_conversation` that does NOT exist in
      // production. Every invite tap silently failed at this line. The
      // real production messenger uses /api/messenger/start-conversation
      // which writes to the social_conversations + social_conversation_participants
      // tables (NOT the legacy `conversations` table the RPC would have
      // touched). Switching to the canonical endpoint.
      const convResp = await fetch('/api/messenger/start-conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ otherUserId: friendId }),
      });
      const convData = await convResp.json().catch(() => ({}));
      if (!convResp.ok || !convData?.conversationId) {
        throw new Error(convData?.error || 'Could not open conversation');
      }
      const convId = convData.conversationId;

      const inviteQs = `room=${streamId}&invite=${inviteCode}`;
      const res = await fetch('/api/messenger/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversationId: convId,
          content: `[LIVE_INVITE]${inviteQs}`,
          message_type: 'text',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Send failed');
      }
      toast.success('Invite sent!');
    } catch (err) {
      console.warn('[GuestInviteModal] sendInvite error:', err?.message || err);
      toast.error(err?.message || 'Failed to send invite');
    }
    setSendingId(null);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1C1E21',
          padding: 20,
          borderRadius: 12,
          width: '90%',
          maxWidth: 400,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>
            Invite Guest via Messenger
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        {loading ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '20px 0' }}>
            Loading friends...
          </div>
        ) : (
          <>
            {/* Bug24: search input — show friends list only when user types */}
            <input
              type="text"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              placeholder="Search friends to invite..."
              autoFocus
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1.5px solid #444',
                background: '#2a2c2f',
                color: '#fff',
                fontSize: 15,
                outline: 'none',
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />
            {guestSearch.trim().length > 0 && (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {(() => {
                  const q = guestSearch.trim().toLowerCase();
                  const filtered = friends.filter((f) =>
                    (f.display_name || f.username || '').toLowerCase().includes(q)
                  );
                  if (filtered.length === 0) {
                    return (
                      <div style={{ color: '#aaa', textAlign: 'center', padding: '20px 0' }}>
                        No matches found.
                      </div>
                    );
                  }
                  return filtered.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: '1px solid #333',
                      }}
                    >
                      <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>
                        {f.display_name || f.username}
                      </div>
                      <button
                        onClick={() => sendInvite(f.id)}
                        disabled={sendingId === f.id}
                        style={{
                          background: sendingId === f.id ? '#444' : '#1877F2',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: 6,
                          fontWeight: 600,
                          cursor: sendingId === f.id ? 'default' : 'pointer',
                          fontSize: 13,
                        }}
                      >
                        {sendingId === f.id ? 'Sending...' : 'Invite'}
                      </button>
                    </div>
                  ));
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function GoLiveModal({
  isOpen,
  onClose,
  user,
  guestMode = false,
  initialRoomId = null,
  initialInviteCode = null,
}) {
  const [stage, setStage] = useState('preview'); // preview | countdown | live | ended
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  // STREAM-BUG-11: open the viewer list panel when the broadcaster taps the
  // viewer-count badge. Previously the badge was a static div and tapping
  // did nothing — Dan: "WHEN A USER CLICKS ON THE VIEWER LIST DURING MY
  // LIVE BROADCAST, NOTHING HAPPENS."
  const [showViewerList, setShowViewerList] = useState(false);
  const [streamId, setStreamId] = useState(initialRoomId || null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const [showControls, setShowControls] = useState(false); // tap-to-reveal
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [controlsTimer, setControlsTimer] = useState(null);
  // New v2 state
  const [isReconnecting, setIsReconnecting] = useState(false);
  // STREAM-BUG-6: after 60s of failed reconnects, show a popup with an
  // explicit Try Reconnect button + End Stream confirmation instead of
  // silently ending the broadcast. Dan: "There needs to be a popup that
  // comes up, with a 'Reconnect' button and a confirmation."
  const [reconnectStuck, setReconnectStuck] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [isCameraFlipping, setIsCameraFlipping] = useState(false);
  // BUG-FIX-FLIP: track mirror state — front camera mirrors, rear doesn't
  const [isMirrored, setIsMirrored] = useState(true);
  // BUG-FIX-LIVE2-1b: per-user zoom control. zoomCapability comes from the
  // active video track via getCapabilities().zoom when supported. Most
  // mobile devices expose zoom as a continuous range. We clamp and apply
  // via applyConstraints({ advanced: [{ zoom }] }) which is the correct
  // pattern for the Image Capture / MediaTrack zoom spec.
  const [zoomCapability, setZoomCapability] = useState(null); // { min, max, step }
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomSliderOpen, setZoomSliderOpen] = useState(false);
  // BUG-FIX-LIVE2-2: tappable hide of the time/duration overlay. Default
  // visible; one tap hides; tap the (now ghost) area or the show-button to
  // bring it back.
  const [timeOverlayHidden, setTimeOverlayHidden] = useState(false);
  const [category, setCategory] = useState('general');
  const [connectionQuality, setConnectionQuality] = useState('excellent');
  const [giftFlash, setGiftFlash] = useState(null);
  const [isStarting, setIsStarting] = useState(false); // #3/#11: prevents double-tap on Go Live
  const [recordingFailed, setRecordingFailed] = useState(false); // #12: warns when recording unavailable
  const [description, setDescription] = useState(''); // #9: stream description
  const [topGifters, setTopGifters] = useState({}); // Feature 5: Top Supporters
  const [topGiftersVisible, setTopGiftersVisible] = useState(false); // Bug3: auto-hide
  const [softwareZoomFallback, setSoftwareZoomFallback] = useState(false); // Bug5
  // BUG-FIX-BEAUTY-AUTO: beauty mode is always enabled — no user toggle needed.
  // The canvas filter (brightness/contrast/saturation/blur) is applied on go-live
  // and never disabled. The icon has been removed from the UI.
  const [beautyMode, setBeautyMode] = useState(true);
  const [streamEndedExternally, setStreamEndedExternally] = useState(false); // Bug25: stale-cleanup ended stream while broadcaster was live
  const [pinnedComment, setPinnedComment] = useState(null); // #18: pinned comment
  const [guestInviteCode, setGuestInviteCode] = useState(initialInviteCode || null); // #6: guest invite
  const [commentMenu, setCommentMenu] = useState(null); // #19: comment action menu
  const [isMuted, setIsMuted] = useState(false); // #6: mic mute toggle
  // ── PHASE 2: pre-live co-host pick (Dan: "ability to START with 2 people") ──
  // pendingCohost is a friend object selected BEFORE going live. After
  // startBroadcast returns the real guest_invite_code, we auto-send the
  // invite via messenger so the co-host can join from t=0. cohostInviteSent
  // gates the auto-send so it only fires once.
  const [pendingCohost, setPendingCohost] = useState(null);
  const [cohostInviteSent, setCohostInviteSent] = useState(false);
  const [cohostPickerOpen, setCohostPickerOpen] = useState(false);
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
  const pinChannelRef = useRef(null); // AUDIT-B: live-pins broadcaster sync
  // BUG FIX (GLM-1): track giftFlash timer ref to prevent broadcaster-side timer storm
  const giftFlashTimerRef = useRef(null);
  const topGiftersHideTimerRef = useRef(null); // Bug3
  // BUG FIX (GLM-3): track share toast timer ref
  const shareToastTimerRef = useRef(null);
  // BUG FIX (GLM-5): track in-flight getUserMedia mount guard
  const mediaAccessMountedRef = useRef(true);
  // BUG FIX (GLM-6): track error-clear timer so it cancels on unmount
  const errorTimerRef = useRef(null);
  // BUG-FIX-LIVE-5: rolling preview capture (uploads ~12s loop clip every 25s)
  const previewCaptureRef = useRef(null);
  // Bug20: canvas refs for applying beauty filter to the outgoing LiveKit stream
  const beautyCanvasRef = useRef(null);
  const beautyAnimFrameRef = useRef(null);
  const beautyHiddenTimerRef = useRef(null); // hidden-tab draw timer (2026-08-15)
  // BUG-FIX-9: guest (co-host) realtime viewer count channel.
  // The host heartbeat updates live_streams.viewer_count in the DB; guests
  // subscribe to this Postgres channel so their viewer counter stays in sync.
  const guestViewerCountChannelRef = useRef(null);

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
          .order('started_at', { ascending: false })
          .limit(1)
          .then(({ data, error }) => {
            // limit(1) not maybeSingle(): two orphaned live rows made
            // maybeSingle() error out and the reconnect banner never showed
            // for exactly the user who needed it most.
            if (error) console.warn('[GoLive] existing-stream check failed:', error.message);
            if (data?.[0]) setExistingLiveStream(data[0]);
            setCheckingExistingStream(false);
          })
          .catch(() => setCheckingExistingStream(false));
      }
    }
    return () => {
      mediaAccessMountedRef.current = false;
      // 2026-08-15 audit: reset the go-live guard so closing the modal mid-
      // countdown doesn't leave the button stuck on "Starting…" forever.
      setIsStarting(false);
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
      if (topGiftersHideTimerRef.current) clearTimeout(topGiftersHideTimerRef.current);
      // BUG FIX (GLM-3): cancel share toast timer on modal close
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      // BUG FIX (GLM-6): cancel error clear timer on modal close
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      // BUG-FIX-WATCHDOG: cancel watchdog timer on modal close
      if (reconnectWatchdogRef.current) {
        clearTimeout(reconnectWatchdogRef.current);
        reconnectWatchdogRef.current = null;
      }
      // FIX: countdown interval cleanup was AFTER the return — unreachable dead code
      if (timerRef._cdInterval) {
        clearInterval(timerRef._cdInterval);
        timerRef._cdInterval = null;
      }
      // FIX: null stale singleton callbacks
      liveStreamService.onViewerCountChange = null;
      liveStreamService.onReconnecting = null;
      liveStreamService.onReconnected = null;
      liveStreamService.onConnectionQualityChange = null;
      liveStreamService.onStreamEndedExternally = null; // Bug25
      liveStreamService.onStreamEnded = null; // BUG-FIX-11: clear guest auto-close callback
      liveStreamService.onTrackAdded = null; // BUG-FIX-2: clear guest track-add callback
      // BUG-FIX-9: clean up guest viewer count realtime subscription
      if (guestViewerCountChannelRef.current) {
        try {
          supabase.removeChannel(guestViewerCountChannelRef.current);
        } catch (_) {}
        guestViewerCountChannelRef.current = null;
      }
      // FIX: if modal is force-closed during live broadcast, end the broadcast to prevent zombie room
      if (liveStreamService.room && liveStreamService.isBroadcaster) {
        liveStreamService.endBroadcast().catch(() => {});
        busEmit.dataMutated?.('live_streams');
      }
      // BUG-FIX-LIVE-5: stop the rolling preview capture on force-close
      if (previewCaptureRef.current) {
        try {
          previewCaptureRef.current.stop();
        } catch (_) {}
        previewCaptureRef.current = null;
      }
      // BUG-FIX-GLM-STALE-FLAGS: reset overlay-trigger booleans so they don't
      // bleed into the next broadcast session if the modal is force-closed
      setStreamEndedExternally(false);
      setReconnectStuck(false);
      setIsReconnecting(false);
    };
  }, [isOpen]);

  // Bug20: canvas-based beauty filter — applies ctx.filter to outgoing LiveKit stream
  // CSS filter only affects local <video> preview; this captures it via canvas and
  // replaces the published track so watchers also see the filtered video.
  useEffect(() => {
    if (stage !== 'live') return;
    let cancelled = false;
    const startBeautyCanvas = async () => {
      const video = videoRef.current;
      if (!video) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      beautyCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d');
      const draw = () => {
        if (cancelled || !beautyCanvasRef.current) return;
        // GAP-3 AUDIT FIX: skip frames while video metadata hasn't loaded.
        // drawImage() on an unready video element produces a black frame —
        // beauty canvas would replace the published track with solid black.
        if (video.readyState < 2 || !video.videoWidth) {
          beautyAnimFrameRef.current = requestAnimationFrame(draw);
          return;
        }
        if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.filter = 'brightness(1.06) contrast(0.92) saturate(1.12) blur(0.4px)';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // rAF stops in hidden tabs, freezing the published canvas track for
        // every viewer while audio keeps rolling. Fall back to a 33ms timer
        // whenever the document is hidden (2026-08-15 audit fix).
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          beautyAnimFrameRef.current = null;
          beautyHiddenTimerRef.current = setTimeout(draw, 33);
        } else {
          if (beautyHiddenTimerRef.current) {
            clearTimeout(beautyHiddenTimerRef.current);
            beautyHiddenTimerRef.current = null;
          }
          beautyAnimFrameRef.current = requestAnimationFrame(draw);
        }
      };
      draw();
      const canvasStream = canvas.captureStream(30);
      const newVideoTrack = canvasStream.getVideoTracks()[0];
      if (newVideoTrack && liveStreamService.room) {
        try {
          await liveStreamService.replaceVideoTrack(newVideoTrack);
        } catch (e) {
          console.warn('[GoLive] beauty filter track replace failed:', e);
        }
      }
    };
    const stopBeautyCanvas = async () => {
      if (beautyAnimFrameRef.current) {
        cancelAnimationFrame(beautyAnimFrameRef.current);
        beautyAnimFrameRef.current = null;
      }
      beautyCanvasRef.current = null;
      if (liveStreamService.localStream && liveStreamService.room) {
        const originalTrack = liveStreamService.localStream.getVideoTracks()[0];
        if (originalTrack) {
          try {
            await liveStreamService.replaceVideoTrack(originalTrack);
          } catch (e) {
            console.warn('[GoLive] beauty filter restore failed:', e);
          }
        }
      }
    };
    if (beautyMode) {
      startBeautyCanvas();
    } else {
      stopBeautyCanvas();
    }
    return () => {
      cancelled = true;
      if (beautyAnimFrameRef.current) {
        cancelAnimationFrame(beautyAnimFrameRef.current);
        beautyAnimFrameRef.current = null;
      }
      if (beautyHiddenTimerRef.current) {
        clearTimeout(beautyHiddenTimerRef.current);
        beautyHiddenTimerRef.current = null;
      }
      beautyCanvasRef.current = null;
    };
  }, [beautyMode, stage]);

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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_comments',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          if (payload.new.user_id !== user?.id) {
            // Don't double-add own comments
            setComments((prev) => {
              if (prev.some((c) => c.id === payload.new.id)) return prev;
              // AUDIT-C: cap comment buffer to prevent memory leak on long streams
              const next = [...prev, payload.new];
              return next.length > 200 ? next.slice(next.length - 200) : next;
            });
          }
        }
      )
      // AUDIT-D: broadcaster's own chat must reflect deleted comments
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'live_comments',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
        }
      )
      .subscribe();
    commentChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [streamId, user?.id]);

  // Subscribe to gift events for gift animations
  useEffect(() => {
    if (!streamId) return;

    // Fetch historical gifts for leaderboard
    fetch(`/api/live/gifts?stream_id=${streamId}`)
      .then((res) => res.json())
      .then((data) => {
        // Bug3/4: keyed by userId with display names from leaderboard API
        if (data.leaderboard && data.leaderboard.length > 0) {
          const shaped = {};
          data.leaderboard.forEach(({ user_id, name, avatar_url, amount }) => {
            shaped[user_id] = { name: name || 'A fan', avatar: avatar_url || null, amount };
          });
          setTopGifters(shaped);
        }
      })
      .catch((err) => console.error('Failed to load gifts', err));

    const giftCh = supabase.channel(`live-gifts-${streamId}`, {
      config: { broadcast: { self: false } },
    });
    giftCh
      .on('broadcast', { event: 'gift' }, ({ payload }) => {
        if (payload?.sender_name && payload?.amount) {
          // BUG FIX (GLM-1): cancel previous timer before setting new one (timer storm)
          if (giftFlashTimerRef.current) clearTimeout(giftFlashTimerRef.current);
          setGiftFlash({ name: payload.sender_name, amount: payload.amount });
          giftFlashTimerRef.current = setTimeout(() => {
            giftFlashTimerRef.current = null;
            setGiftFlash(null);
          }, 4000);

          // Bug3/4: keyed by userId with display name
          setTopGifters((prev) => {
            const userId = payload.sender_id;
            if (!userId) return prev;
            const existing = prev[userId] || {
              name: payload.sender_name || 'A fan',
              avatar: payload.sender_avatar || null,
              amount: 0,
            };
            return {
              ...prev,
              [userId]: {
                name: existing.name,
                avatar: existing.avatar,
                amount: existing.amount + payload.amount,
              },
            };
          });
          setTopGiftersVisible(true);
          if (topGiftersHideTimerRef.current) clearTimeout(topGiftersHideTimerRef.current);
          topGiftersHideTimerRef.current = setTimeout(() => {
            setTopGiftersVisible(false);
            topGiftersHideTimerRef.current = null;
          }, 20000);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(giftCh);
      // BUG FIX (GLM-1): also clear on effect cleanup
      if (giftFlashTimerRef.current) {
        clearTimeout(giftFlashTimerRef.current);
        giftFlashTimerRef.current = null;
      }
    };
  }, [streamId]);

  // AUDIT-B: GoLiveModal must subscribe to live-pins so co-host pin/unpin
  // events (and server-side failures that leave local state stale) are
  // reflected on the broadcaster's screen — same pattern as LiveStreamViewer.
  useEffect(() => {
    if (!streamId) return;
    const pinCh = supabase
      .channel(`live-pins-broadcaster-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_pins',
          filter: `stream_id=eq.${streamId}`,
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
            setPinnedComment(comment || null);
          }
        }
      )
      .subscribe();
    pinChannelRef.current = pinCh;

    // Pre-fetch existing pin on mount (stream may already have one)
    supabase
      .from('live_pins')
      .select('comment_id')
      .eq('stream_id', streamId)
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
          if (comment) setPinnedComment(comment);
        }
      });

    return () => {
      if (pinChannelRef.current) {
        supabase.removeChannel(pinChannelRef.current);
        pinChannelRef.current = null;
      }
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

  // BUG-FIX-LIVE2-1b: detect zoom capability on the active video track.
  // Returns { min, max, step, current } when supported, null otherwise.
  // Most modern mobile devices (iOS 14.3+, modern Android Chrome) expose
  // zoom via getCapabilities().zoom; older browsers and most desktop
  // webcams don't, in which case we hide the slider entirely.
  const detectZoomCapability = (stream) => {
    try {
      const track = stream?.getVideoTracks?.()[0];
      if (!track || typeof track.getCapabilities !== 'function') return null;
      const caps = track.getCapabilities();
      if (!caps || typeof caps.zoom === 'undefined') return null;
      const z = caps.zoom;
      // Some browsers expose discrete (min/max/step), some continuous (just min/max)
      const min = typeof z.min === 'number' ? z.min : 1;
      const max = typeof z.max === 'number' ? z.max : 1;
      if (max <= min) return null; // No range = no zoom
      const step = typeof z.step === 'number' ? z.step : 0.1;
      const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
      const current = typeof settings.zoom === 'number' ? settings.zoom : min;
      return { min, max, step, current };
    } catch (_) {
      return null;
    }
  };

  // Apply a zoom value via the MediaTrack constraints API when hardware
  // zoom is supported, OR fall back to CSS scale on the preview video
  // element when it isn't. STREAM-BUG-2 ("zoom in/out doesn't work"):
  // most webcams and many iOS Safari versions don't expose
  // getCapabilities().zoom, so the previous early-return left the slider
  // dead and Dan saw no effect. The CSS-scale fallback at least makes the
  // broadcaster's preview zoom — the published stream still won't zoom
  // without hardware support, hence the "preview only" caption on the
  // software-zoom slider.
  const applyZoom = async (z) => {
    // Clamp using detected capability if present, else a 1–3× software range
    const min = zoomCapability?.min ?? 1;
    const max = zoomCapability?.max ?? 3;
    const clamped = Math.max(min, Math.min(max, z));
    setZoomLevel(clamped);
    if (!streamRef.current || !zoomCapability) {
      // Software-zoom path: the CSS transform on the <video> element
      // reads zoomLevel directly (see render), so just updating state
      // is enough.
      return;
    }
    try {
      const track = streamRef.current.getVideoTracks?.()[0];
      if (!track) return;
      await track.applyConstraints({ advanced: [{ zoom: clamped }] });
    } catch (err) {
      console.warn('[GoLive] applyZoom failed — CSS fallback:', err?.message || err);
      setSoftwareZoomFallback(true);
    }
  };

  // Detect zoom whenever the stream is attached — handled inline in
  // requestMediaAccess + handleFlipCamera (BUG-HUNT-1). The previous
  // useEffect on [stage] never re-fired after the async acquire resolved.

  // BUG-HUNT-1: zoom detection. Previously a useEffect on [stage] tried
  // to detect — but on first mount stage='preview' fires BEFORE the async
  // acquireMediaStream() resolves, so streamRef.current was still null and
  // the effect bailed. Stage doesn't change again so detection never reran.
  // Fix: detect synchronously in requestMediaAccess after assigning streamRef
  // (both the cached fast-path and the fresh-acquire path) and after camera
  // flip (handled in handleFlipCamera).
  const detectAndApplyZoom = (stream) => {
    if (!stream) return;
    const cap = detectZoomCapability(stream);
    setZoomCapability(cap);
    setZoomLevel(cap ? cap.current : 1);
  };

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
        if (videoRef.current) {
          videoRef.current.srcObject = cached;
          try {
            await videoRef.current.play();
          } catch (_) {}
        }
        setStage('preview');
        setError('');
        detectAndApplyZoom(cached); // BUG-HUNT-1
        return;
      }

      const stream = await acquireMediaStream();
      // Modal could have closed while the prompt was open — guard
      // before touching DOM/state.
      if (!mediaAccessMountedRef.current) return;

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (_) {}
      }
      setStage('preview');
      setError('');
      detectAndApplyZoom(stream); // BUG-HUNT-1

      // BUG-FIX-1: Black-frame watchdog.
      // On iOS Safari, the camera sometimes returns a valid MediaStream whose
      // video track reports readyState='live' but produces a black frame for
      // 1-2 seconds on first acquire (camera hardware cold-start). Detect this
      // by checking videoWidth 3s after attach; if it's still 0 (no decoded
      // frame), force-release the singleton and re-acquire to kick the hardware.
      setTimeout(async () => {
        if (!mediaAccessMountedRef.current) return;
        const vEl = videoRef.current;
        if (vEl && vEl.readyState < 2 && !vEl.videoWidth) {
          console.warn(
            '[GoLive] Black-frame watchdog: no decoded frame after 3s — re-acquiring camera'
          );
          // Force-release the singleton so acquireMediaStream gets a fresh track
          releaseMediaStream({ force: true });
          // Re-request from scratch (may briefly show black, then correct itself)
          try {
            const freshStream = await acquireMediaStream();
            if (!mediaAccessMountedRef.current) return;
            streamRef.current = freshStream;
            if (videoRef.current) {
              videoRef.current.srcObject = freshStream;
              try {
                await videoRef.current.play();
              } catch (_) {}
            }
            detectAndApplyZoom(freshStream);
          } catch (e) {
            console.warn('[GoLive] Black-frame watchdog re-acquire failed:', e?.message);
          }
        }
      }, 3000);
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
    // STREAM-POLISH-R2 THUMB-1: don't mirror the captured thumbnail.
    //
    // The preview <video> is CSS-flipped (scaleX(-1)) only when
    // isMirrored=true (front camera). The underlying videoRef pixel
    // data is the RAW un-mirrored camera feed — same as what LiveKit
    // publishes to viewers. Previously this canvas applied an
    // unconditional `ctx.scale(-1, 1)` flip, which baked a mirror into
    // the saved thumbnail. Result: in the feed, the thumbnail showed
    // a mirrored frame (text backwards, faces reversed) while the
    // actual live video was un-mirrored — a confusing mismatch.
    //
    // Fix: draw the video as-is. The thumbnail now matches what
    // viewers see when they tap in.
    //
    // STREAM-POLISH-R2 THUMB-2: skip capture if the video element
    // hasn't reported real dimensions yet. videoWidth=0 means the
    // metadata hasn't loaded; the previous code fell back to 640x360
    // and painted an empty frame, producing a black thumbnail. Better
    // to return null so handleGoLive logs the skip and the stream
    // goes live without a thumbnail than to ship a black one.
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    if (!vw || !vh) return null;
    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, vw, vh);
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const uploadThumbnail = async (file) => {
    if (!file || !user?.id) return null;
    // BUG-FIX-DEEP-AUDIT-R5 SLM-1 sibling: client-side MIME + size
    // validation. Round 2's bucket lockdown silently broke this upload
    // until R5's migration restored image MIME types. The failure
    // here returns null so the broadcast continues without a
    // thumbnail (existing intent) — but now with a louder log so
    // the next such regression is detectable.
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      console.warn(`[GoLive] thumbnail MIME not allowed: ${file.type}; skipping upload`);
      return null;
    }
    const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
    if (file.size > MAX_BYTES) {
      console.warn(`[GoLive] thumbnail too large: ${file.size} bytes; skipping upload`);
      return null;
    }
    // STREAM-POLISH-R3 THUMB-3: retry up to 3x on transient failures.
    // Supabase storage occasionally returns 503 / network errors during
    // brief regional hiccups; without retry, a one-off blip ships the
    // stream thumbnail-less. Backoff 250ms, 500ms. We do NOT retry on
    // 4xx (auth/permission/MIME-disallow) — those won't fix themselves.
    // 2026-08-15 audit: derive extension from the validated MIME, not the
    // filename (extensionless / multi-dot / HEIC names produced wrong keys).
    const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = EXT_BY_MIME[file.type] || 'jpg';
    const path = `live-thumbnails/${user.id}/${Date.now()}.${ext}`;
    const MAX_ATTEMPTS = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { error: uploadErr } = await supabase.storage
          .from('live-recordings')
          .upload(path, file, { contentType: file.type, upsert: true });
        if (uploadErr) throw uploadErr;
        const { data } = supabase.storage.from('live-recordings').getPublicUrl(path);
        return data.publicUrl;
      } catch (err) {
        lastErr = err;
        const msg = err?.message || String(err);
        // 4xx is not retryable — fail fast on auth/permission/MIME issues.
        if (/40[0-9]|41[0-8]|UNAUTHORIZED|FORBIDDEN|InvalidMime/i.test(msg)) {
          break;
        }
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }
    }
    // BUG-FIX-DEEP-AUDIT-R5 SLM-1: louder logging. Includes the bucket
    // name + MIME so a future allowlist regression is immediately
    // diagnosable from the console. Now also includes attempt count.
    console.warn(
      `[GoLive] thumbnail upload failed after ${MAX_ATTEMPTS} attempts (bucket=live-recordings mime=${file.type}):`,
      lastErr?.message || lastErr
    );
    return null;
  };

  const startRecording = () => {
    // GAP-1 AUDIT FIX: guests must not record. Only the primary broadcaster
    // owns the live_streams row and has write access to live-recordings bucket.
    // A guest recording would either 403 on upload or create an orphaned artifact
    // with no valid stream_id linkage.
    if (guestMode) return;
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    if (!mime) {
      // #12: No supported codec — recording is impossible (e.g. some Safari versions)
      setRecordingFailed(true);
      return;
    }
    setRecordingFailed(false);
    // BUG-FIX-12: record from liveStreamService.localStream instead of streamRef.current.
    // When beauty mode is active, liveStreamService.localStream holds the post-filter
    // canvas video track + original audio track (the actual published stream).
    // streamRef.current may point to the raw getUserMedia stream whose video track was
    // ended/replaced by the beauty canvas, resulting in empty chunks and a 1-second recording.
    // localStream always reflects the current live published stream; fall back to
    // streamRef.current if the service stream isn't available yet.
    const recordingStream = liveStreamService.localStream || streamRef.current;
    // GAP-5 AUDIT FIX: validate that a live video track exists before starting.
    // If beauty canvas crashed silently, localStream may have no video tracks,
    // producing an audio-only recording that the user would see as broken video.
    const videoTracks = recordingStream.getVideoTracks();
    if (!videoTracks.length || videoTracks[0].readyState === 'ended') {
      console.warn(
        '[GoLive] startRecording: no live video track on recording stream — using raw camera fallback'
      );
      // Fall back to raw camera stream which always has a live video track
      const fallback = streamRef.current;
      if (!fallback || !fallback.getVideoTracks().length) {
        setRecordingFailed(true);
        return;
      }
      const mr2 = new MediaRecorder(fallback, { mimeType: mime, videoBitsPerSecond: 2500000 });
      mr2.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr2.onstop = () => setRecordedBlob(new Blob(recordedChunksRef.current, { type: mime }));
      mr2.start(1000);
      mediaRecorderRef.current = mr2;
      return;
    }
    const mr = new MediaRecorder(recordingStream, {
      mimeType: mime,
      videoBitsPerSecond: 2500000,
    });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mr.onstop = () => setRecordedBlob(new Blob(recordedChunksRef.current, { type: mime }));
    mr.start(1000);
    mediaRecorderRef.current = mr;
  };

  const handleGoLive = async () => {
    // #3/#11: Prevent double-tap / double-broadcast on slow networks
    if (isStarting) return;
    if (!streamRef.current || !user?.id) {
      setError('Unable to start stream.');
      return;
    }
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
      // 2026-08-15 audit: if the picked cover failed (HEIC/oversized/network),
      // don't go live thumbnail-less — fall through to an auto-captured frame.
      if (!thumbUrl && !guestMode) {
        try { toast.info('Could not use that image — using a camera frame instead'); } catch (_) {}
      }
    }
    if (!thumbUrl && !guestMode && user?.id) {
      // captureThumbnail() returns a data URL; convert to a Blob and upload.
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
        console.warn(
          '[GoLive] captureThumbnail returned null — videoWidth:',
          videoRef.current?.videoWidth
        );
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
      // BUG-FIX-11: when host ends stream, auto-close guest modal
      liveStreamService.onStreamEnded = () => {
        if (guestMode) {
          onClose?.();
        }
      };
      // BUG-FIX-2 + AUDIT-GAP-2: re-attach guest camera tracks as they arrive post-publish.
      // Previous impl spread [...prev] which is a no-op re-render — React may bail if
      // participant identities haven't changed. Pull the live list from the room directly
      // so the video ref callback fires and track.attach(el) is called on the new track.
      liveStreamService.onTrackAdded = (mediaStream, kind) => {
        if (!guestMode && kind === 'video') {
          const fresh = Array.from(liveStreamService.room?.remoteParticipants?.values() ?? []);
          setParticipants(fresh);
        }
      };
      liveStreamService.onReconnecting = () => {
        setIsReconnecting(true);
        // STREAM-BUG-6: after 60s of failed reconnects, surface a
        // popup instead of silently ending the broadcast. The
        // popup gives the broadcaster two explicit options:
        // "Try Reconnect" (force-reconnect with reset attempt budget)
        // or "End Stream" (confirmed handoff to handleEndStream so
        // they can still save/post the recording).
        if (reconnectWatchdogRef.current) clearTimeout(reconnectWatchdogRef.current);
        reconnectWatchdogRef.current = setTimeout(() => {
          reconnectWatchdogRef.current = null;
          setIsReconnecting((prev) => {
            if (prev) {
              console.warn(
                '[GoLive] 60s reconnect watchdog fired — surfacing stuck-popup (no auto-end)'
              );
              setReconnectStuck(true);
            }
            return prev;
          });
        }, 60000);
      };
      liveStreamService.onReconnected = () => {
        setIsReconnecting(false);
        setReconnectStuck(false);
        // Cancel watchdog if we successfully reconnected
        if (reconnectWatchdogRef.current) {
          clearTimeout(reconnectWatchdogRef.current);
          reconnectWatchdogRef.current = null;
        }
      };
      liveStreamService.onConnectionQualityChange = (q) => setConnectionQuality(q);
      liveStreamService.onParticipantsUpdate = (ps) => setParticipants(ps); // FEATURE 6
      // Bug25: alert broadcaster if stale-cleanup or DB ends the stream externally
      // BUG-FIX-DURATION-SYNC: stop the elapsed timer immediately when the
      // stream is externally killed. Previously the timer kept ticking after
      // the external-end overlay appeared, causing the EndStreamModal to show
      // a duration 2+ minutes longer than what the live screen displayed.
      liveStreamService.onStreamEndedExternally = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setStreamEndedExternally(true);
      };

      // BUG-FIX-LIVE-5 verification: capture the active stream id locally
      // — React's setStreamId is async, so reading `streamId` (state) below
      // would give us the previous render's value (null on first broadcast).
      // The LiveStreamService field is `currentStreamId` (not `streamId`).
      let activeStreamId = null;

      if (guestMode && initialRoomId && initialInviteCode) {
        await liveStreamService.joinAsGuest(
          user.id,
          initialRoomId,
          initialInviteCode,
          streamRef.current
        );
        activeStreamId = initialRoomId;
        setStreamId(initialRoomId);
        setGuestInviteCode(initialInviteCode);
      } else {
        const { streamId: newId, guestInviteCode: newInviteCode } =
          await liveStreamService.startBroadcast(
            user.id,
            title ||
              `${user.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Live'}'s Live`,
            streamRef.current,
            thumbUrl,
            category,
            description
          );
        activeStreamId = newId;
        setStreamId(newId);
        setGuestInviteCode(newInviteCode);

        // ── PHASE 2: auto-send the pre-staged co-host invite ──
        // Dan: "ability to START with 2 people for the stream". The
        // host pre-selects a friend during preview; the moment we
        // have the real guest_invite_code (which only the server can
        // generate), we fire the messenger invite. Co-host taps
        // Join → /hub/live/guest renders GoLiveModal in guestMode →
        // joinAsGuest publishes their tracks to the same LiveKit
        // room → both visible from t=0.
        if (pendingCohost && newId && newInviteCode && !cohostInviteSent) {
          setCohostInviteSent(true);
          try {
            const { getAccessToken } = await import('../../lib/authUtils');
            const token = getAccessToken();
            const convResp = await fetch('/api/messenger/start-conversation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ otherUserId: pendingCohost.id }),
            });
            const convData = await convResp.json().catch(() => ({}));
            if (!convResp.ok || !convData?.conversationId) {
              throw new Error(convData?.error || 'Could not open conversation');
            }
            const inviteQs = `room=${newId}&invite=${newInviteCode}`;
            const sendResp = await fetch('/api/messenger/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                conversationId: convData.conversationId,
                content: `[LIVE_INVITE]${inviteQs}`,
                message_type: 'text',
              }),
            });
            if (!sendResp.ok) {
              const data = await sendResp.json().catch(() => ({}));
              throw new Error(data?.error || 'Send failed');
            }
            toast.success(
              `Co-host invite sent to ${pendingCohost.display_name || pendingCohost.username}`
            );
          } catch (cohostErr) {
            console.warn(
              '[GoLiveModal] cohost auto-invite failed:',
              cohostErr?.message || cohostErr
            );
            toast.error(
              `Couldn't invite co-host: ${cohostErr?.message || 'unknown'} — use the Invite Guest button to retry`
            );
          }
        }
      }

      setStage('live');
      setElapsedTime(0);
      startRecording();

      // BUG-FIX-9: guest viewer count realtime subscription.
      // The host's heartbeat is the authoritative writer of live_streams.viewer_count.
      // Guests don't run the heartbeat, so they never receive viewer count updates
      // via liveStreamService.onViewerCountChange (which is driven by LiveKit room
      // metadata, only updated by the host). Subscribe to Postgres changes directly
      // so the guest's HUD shows the real viewer count, not the 0 from join time.
      if (guestMode && activeStreamId) {
        try {
          if (guestViewerCountChannelRef.current) {
            supabase.removeChannel(guestViewerCountChannelRef.current);
          }
          const guestVCCh = supabase
            .channel(`live-streams-guest-vc-${activeStreamId}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'live_streams',
                filter: `id=eq.${activeStreamId}`,
              },
              (payload) => {
                if (typeof payload.new?.viewer_count === 'number') {
                  setViewerCount(payload.new.viewer_count);
                }
              }
            )
            .subscribe();
          guestViewerCountChannelRef.current = guestVCCh;
        } catch (guestVCErr) {
          console.warn(
            '[GoLiveModal] guest viewer count subscription failed:',
            guestVCErr?.message
          );
        }
      }

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
            try {
              previewCaptureRef.current.stop();
            } catch (_) {}
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

      timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
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
      try {
        busEmit.dataMutated?.('social_posts');
      } catch (_) {}
    } catch (err) {
      setError(err.message || 'Failed to start broadcast.');
      setStage('preview');
      setIsStarting(false); // BUG FIX: reset so user can retry
    }
  };

  const handleScreenTap = useCallback(() => {
    setShowControls((prev) => {
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

  const handleEndStream = async ({ skipConfirm = false } = {}) => {
    // BUG-FIX-LIVE-10 hardening: ignore re-entry. Without this, a fast
    // double-tap on End Stream runs two finalizeRecording promises in
    // parallel and the mediaRecorder errors out before either resolves.
    if (isEnding) return;
    setIsEnding(true);

    // BUG-FIX-LIVE2-3b: GUESTS LEAVE; THEY DO NOT END THE HOST'S STREAM.
    // Previously this function went straight into the broadcaster path
    // for guests too — calling /api/live/end-stream?action=force_end with
    // the host's stream_id, which killed the host's broadcast. Symptom
    // Dan reported: "WHEN THE GUEST 'ENDED' IT KILLED THE MAIN STREAM."
    // For guests we simply leaveStream() (LiveKit disconnect, no DB write
    // touching the host's row) and close the modal.
    if (guestMode) {
      if (!confirm('Leave the stream? The host\u2019s broadcast will continue without you.')) {
        setIsEnding(false);
        return;
      }
      try {
        liveStreamService.isManualDisconnect = true;
        await Promise.race([
          liveStreamService.leaveStream(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch (err) {
        console.warn('[handleEndStream guest] leaveStream non-fatal:', err?.message || err);
      }
      try {
        busEmit.dataMutated?.('live_streams');
      } catch (_) {}
      // AUDIT-FIX: reset isEnding before onClose so the button isn't frozen
      // if the parent component doesn't immediately unmount this modal.
      setIsEnding(false);
      onClose?.();
      return;
    }

    // #1: Confirm before ending — prevents accidental stream kills
    if (
      !skipConfirm &&
      !confirm('End your live stream? This will stop broadcasting to all viewers.')
    ) {
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
    const finalizeRecording = () =>
      new Promise((resolve) => {
        const mr = mediaRecorderRef.current;
        if (!mr || mr.state === 'inactive') return resolve(null);
        const mime = mr.mimeType || 'video/webm';
        let settled = false;
        const onStopOnce = () => {
          if (settled) return;
          settled = true;
          try {
            mr.removeEventListener('stop', onStopOnce);
          } catch (_) {}
          try {
            const blob = new Blob(recordedChunksRef.current, { type: mime });
            resolve(blob);
          } catch (_e) {
            resolve(null);
          }
        };
        mr.addEventListener('stop', onStopOnce);
        try {
          mr.stop();
        } catch (_) {
          onStopOnce();
        }
        setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              mr.removeEventListener('stop', onStopOnce);
            } catch (_) {}
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
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsStarting(false);

    // ── 2a. Stop the rolling preview capture ────────────────────────────
    // BUG-FIX-LIVE-5: any in-flight upload is allowed to complete (it has
    // no awaiters); the recorder is halted so no new windows kick off.
    if (previewCaptureRef.current) {
      try {
        previewCaptureRef.current.stop();
      } catch (_) {}
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
    try {
      busEmit.dataMutated?.('live_streams');
    } catch (_) {}
    try {
      busEmit.dataMutated?.('social_posts');
    } catch (_) {}
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
      // BUG-FIX-LIVE2-1b E7: re-detect zoom capability on the new
      // track. Front and back cameras typically expose different
      // zoom ranges (front often has none, back has 1-10x). Reset
      // zoomLevel to the new track's current zoom so we don't
      // apply a stale value that's out of the new range.
      if (fullStream) {
        const cap = detectZoomCapability(fullStream);
        setZoomCapability(cap);
        setZoomLevel(cap ? cap.current : 1);
        setZoomSliderOpen(false); // close the slider since the range changed
      }
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
    // BUG-FIX-GLM-RECONNECT-REENTRY: belt-and-suspenders guard. The button is
    // disabled={isStarting} but there is a tick between tap and re-render; a
    // second tap in that window would launch a second concurrent reconnect.
    if (isStarting) return;
    setIsStarting(true);
    setError('');
    try {
      liveStreamService.onViewerCountChange = (c) => setViewerCount(c);
      // BUG-14 FIX: use same crash watchdog as startBroadcast. Without this,
      // a permanent reconnect failure during handleReconnectToExisting left
      // the broadcaster with no notification and a frozen UI.
      liveStreamService.onReconnecting = () => {
        setIsReconnecting(true);
        if (reconnectWatchdogRef.current) clearTimeout(reconnectWatchdogRef.current);
        reconnectWatchdogRef.current = setTimeout(() => {
          reconnectWatchdogRef.current = null;
          setIsReconnecting((prev) => {
            if (prev) {
              console.warn('[GoLive/reconnect] 60s watchdog fired — surfacing stuck popup');
              setReconnectStuck(true);
            }
            return prev;
          });
        }, 60000);
      };
      liveStreamService.onReconnected = () => {
        setIsReconnecting(false);
        setReconnectStuck(false);
        if (reconnectWatchdogRef.current) {
          clearTimeout(reconnectWatchdogRef.current);
          reconnectWatchdogRef.current = null;
        }
      };
      liveStreamService.onConnectionQualityChange = (q) => setConnectionQuality(q);
      liveStreamService.onParticipantsUpdate = (ps) => setParticipants(ps);
      // Re-join the existing LiveKit room
      const reconnectStreamId = existingLiveStream.id;
      const { token, url } = await liveStreamService._getToken(reconnectStreamId, true);
      if (liveStreamService.room) {
        liveStreamService.room.disconnect().catch(() => {});
        liveStreamService.room = null;
      }
      liveStreamService.currentStreamId = reconnectStreamId;
      liveStreamService.isBroadcaster = true;
      liveStreamService.isManualDisconnect = false;
      liveStreamService.localStream = streamRef.current;
      await liveStreamService._connectRoom(url, token, true, streamRef.current);
      // BUG-FIX-GLM-HEARTBEAT-RESTART: restart heartbeat so stale-cleanup cron
      // doesn't kill the recovered stream.
      liveStreamService._startBroadcasterHeartbeat(reconnectStreamId);
      setStreamId(reconnectStreamId);
      setTitle(existingLiveStream.title || '');
      setStage('live');
      setExistingLiveStream(null);
      startRecording();
      // BUG-FIX-GLM-PREVIEW-RESTART: re-acquire media on reconnect so the
      // rolling 12-second clip uploader resumes for the recovered stream.
      try {
        if (streamRef.current) {
          if (previewCaptureRef.current) {
            try {
              previewCaptureRef.current.stop();
            } catch (_) {}
          }
          previewCaptureRef.current = new StreamPreviewCapture({
            mediaStream: streamRef.current,
            streamId: reconnectStreamId,
            userId: user.id,
            getAccessToken: () => getAccessToken(),
            supabase,
            onError: (err) => {
              console.warn('[StreamPreviewCapture/reconnect]', err?.message || err);
            },
          });
          previewCaptureRef.current.start();
        }
      } catch (previewErr) {
        console.warn(
          '[GoLive/reconnect] preview capture init failed:',
          previewErr?.message || previewErr
        );
      }
      timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
      toast.success('Reconnected to your live stream!');
      busEmit.dataMutated?.('live_streams');
    } catch (err) {
      setError('Reconnect failed: ' + err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleShare = async () => {
    // STREAM-BUG-3: while LIVE, the broadcaster's "share" action should pop
    // the in-app friend picker (GuestInviteModal) so they can DM the stream
    // to friends inside the app — not OS share sheet that surfaces iMessage,
    // WhatsApp, etc. The internal picker also reuses the live-stream invite
    // code, which generates an in-app deep link that re-opens the stream.
    // 2026-08-15 audit: only the BROADCASTER can invite co-hosts. A guest
    // pressing share must not be able to hand the host's code to more people;
    // route them to the plain share-link path instead.
    if (guestInviteCode && !guestMode) {
      setGuestInviteModalOpen(true);
      return;
    }
    // Fallback (pre-live or post-live, no invite code yet, or guest) — clipboard.
    // Deliberately skip navigator.share even when available: Dan was clear
    // that external messengers should not be surfaced from the live UI.
    const url = `${window.location.origin}/hub/social-media?stream=${streamId}`;
    try {
      await navigator.clipboard.writeText(url);
      // BUG FIX (GLM-3): use dedicated toast state + tracked timer, not error state
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      setShareToast('Link copied to clipboard!');
      shareToastTimerRef.current = setTimeout(() => {
        shareToastTimerRef.current = null;
        setShareToast('');
      }, 2500);
    } catch {
      /* ignore */
    }
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
    const authorName =
      user.username ||
      user.full_name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'Broadcaster';
    const optimisticId = `opt-${Date.now()}`;
    const newComment = {
      id: optimisticId,
      user_id: user.id,
      author_name: authorName,
      text,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, newComment]);
    try {
      // BUG FIX (GLM-2): broadcaster comments now go through /api/live/comment
      // (just like viewers do) so ban-check, slow-mode, and server-side author_name
      // resolution all apply uniformly. Direct anon-key insert bypassed all of this.
      // AUDIT-FIX: use getFreshAccessToken() to prevent 401 loops on long streams.
      // The broadcaster is on-air for hours; getAccessToken() returns the cached JWT
      // which expires after ~1h, causing comment POSTs to 401 silently.
      const { getFreshAccessToken, getAccessToken } = await import('../../lib/authUtils');
      const token = (await getFreshAccessToken()) || getAccessToken();
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
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));
        setError(json.error || 'Comment failed');
        // BUG FIX (GLM-6): track timer so cancel on unmount avoids stale setState
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => {
          errorTimerRef.current = null;
          setError('');
        }, 3000);
      } else if (json.comment) {
        setComments((prev) => prev.map((c) => (c.id === optimisticId ? json.comment : c)));
      }
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
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
    // BUG-FIX-COHOST-RESET: clear pending co-host selection and the
    // sent-flag so a subsequent Go Live starts with a clean slate.
    // Without this, pendingCohost persists visually (stale name shown)
    // and cohostInviteSent stays true — the next session's auto-invite
    // fires the dedup guard and silently skips sending the invite.
    setPendingCohost(null);
    setCohostInviteSent(false);
    // BUG-FIX-GLM-VIEWERCOUNT: reset viewer count so next session starts at 0
    setViewerCount(0);
    // BUG-FIX-GLM-TOPGIFTERS: clear gifter leaderboard so stale names/amounts
    // don't bleed into the next broadcast session
    setTopGifters({});
    setTopGiftersVisible(false);
    onClose(action);
  };

  const formatTime = (s) => {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  // Analytics card shows first after stream ends, then EndStreamModal
  if (stage === 'ended' && showAnalytics) {
    return <LiveAnalyticsCard streamId={streamId} onContinue={() => setShowAnalytics(false)} />;
  }

  if (stage === 'ended') {
    // BUG-FIX-LIVE2-4: guests never see EndStreamModal. The Save/Post/
    // Delete buttons all hit /api/live/end-stream which 403s for non-
    // broadcasters anyway (server check at line 98). Showing them the
    // modal would just produce confusing 403 toasts. handleEndStream
    // guest branch should already close before reaching this — this
    // is belt-and-suspenders.
    if (guestMode) {
      onClose?.();
      return null;
    }
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
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.88)',
          zIndex: 10000,
          display: 'flex',
          alignItems: stage === 'live' || stage === 'countdown' ? 'center' : 'flex-start',
          justifyContent: 'center',
          overflowY: stage === 'live' || stage === 'countdown' ? 'hidden' : 'auto',
          padding:
            stage === 'live' || stage === 'countdown'
              ? 0
              : 'max(20px, env(safe-area-inset-top, 20px)) 0 max(20px, env(safe-area-inset-bottom, 20px))',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && stage !== 'live') onClose();
        }}
      >
        <style>{`
                @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.7;transform:scale(.96)} }
                @keyframes cdPop { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
                @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>

        <div
          style={{
            background: stage === 'live' || stage === 'countdown' ? '#000' : C.card,
            borderRadius: stage === 'live' || stage === 'countdown' ? 0 : 16,
            width: stage === 'live' || stage === 'countdown' ? '100%' : 'min(560px, 92vw)',
            height: stage === 'live' || stage === 'countdown' ? '100%' : 'auto',
            maxHeight: stage === 'live' || stage === 'countdown' ? '100%' : '92vh',
            overflow: stage === 'live' || stage === 'countdown' ? 'hidden' : 'auto',
            WebkitOverflowScrolling: 'touch',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── PREVIEW STAGE ── */}
          {stage === 'preview' && (
            <div>
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
                  {guestMode ? 'Join Stream' : 'Go Live'}
                </h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!guestMode && (
                    <button
                      onClick={() => setShowSchedule(true)}
                      style={{
                        background: 'none',
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 13,
                        color: C.textSec,
                        cursor: 'pointer',
                      }}
                    >
                      Schedule
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 24,
                      cursor: 'pointer',
                      color: C.textSec,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* BUG-FIX-RECONNECT: banner if user has active stream to reconnect to */}
              {existingLiveStream && (
                <div
                  style={{
                    background: 'rgba(250,56,62,0.1)',
                    border: '1px solid rgba(250,56,62,0.4)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    margin: '0 20px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#FA383E', fontSize: 14 }}>
                      ⚡ Active Stream Detected
                    </div>
                    <div style={{ color: '#65676B', fontSize: 12, marginTop: 2 }}>
                      {existingLiveStream.title || 'Your Live'} is still running. Reconnect?
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setExistingLiveStream(null)}
                      style={{
                        background: 'none',
                        border: '1px solid #DADDE1',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 13,
                        cursor: 'pointer',
                        color: '#65676B',
                      }}
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={handleReconnectToExisting}
                      disabled={isStarting}
                      style={{
                        background: '#FA383E',
                        border: 'none',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'white',
                      }}
                    >
                      {isStarting ? 'Reconnecting...' : 'Reconnect'}
                    </button>
                  </div>
                </div>
              )}

              {/* Camera preview */}
              <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
                {/* BUG-FIX-PERM-1: show appropriate UX copy while waiting for getUserMedia */}
                {!streamRef.current && !error && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      zIndex: 1,
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        border: '3px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        marginBottom: 12,
                      }}
                    />
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {hasMediaPermissionGrant()
                        ? 'Reconnecting camera...'
                        : 'Waiting for camera permission...'}
                    </div>
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  disablePictureInPicture
                  controls={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    // BUG-FIX-1: use 'contain' in preview so native high-res cameras
                    // (2K/4K on modern phones) don't appear super-zoomed inside the
                    // 16/9 preview box. The live stage keeps 'cover' for immersive full-screen.
                    objectFit: 'contain',
                    transform:
                      `${isMirrored ? 'scaleX(-1) ' : ''}${(!zoomCapability || softwareZoomFallback) && zoomLevel !== 1 ? `scale(${zoomLevel})` : ''}`.trim() ||
                      'none',
                    transition: 'all 0.3s ease',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    background: 'rgba(0,0,0,.55)',
                    color: 'white',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    zIndex: 2,
                  }}
                >
                  Preview
                </div>
              </div>

              <div style={{ padding: 20 }}>
                {!guestMode && (
                  <>
                    {/* Thumbnail upload */}
                    <div style={{ marginBottom: 16 }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: 8,
                          fontWeight: 700,
                          fontSize: 14,
                          color: C.text,
                        }}
                      >
                        Stream Thumbnail
                      </label>
                      <div
                        onClick={() => thumbnailInputRef.current?.click()}
                        style={{
                          border: `2px dashed ${thumbnailPreview ? C.red : C.border}`,
                          borderRadius: 10,
                          padding: thumbnailPreview ? 0 : 20,
                          textAlign: 'center',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          position: 'relative',
                          minHeight: 80,
                        }}
                      >
                        {thumbnailPreview ? (
                          <img
                            src={thumbnailPreview}
                            alt="Thumbnail"
                            style={{
                              width: '100%',
                              maxHeight: 160,
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <div>
                            <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>
                              Tap to upload a thumbnail <br />
                              <span style={{ fontSize: 11 }}>JPG, PNG — recommended 1280×720</span>
                            </div>
                          </div>
                        )}
                        {thumbnailPreview && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 8,
                              background: 'rgba(0,0,0,.6)',
                              color: 'white',
                              borderRadius: '50%',
                              width: 24,
                              height: 24,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
                              setThumbnailPreview(null);
                              setThumbnailFile(null);
                            }}
                          >
                            ✕
                          </div>
                        )}
                      </div>
                      <input
                        ref={thumbnailInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleThumbnailSelect}
                      />
                    </div>

                    {/* Stream title */}
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontWeight: 700,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      Stream Title
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`${user?.full_name || user?.user_metadata?.full_name || 'Your'}'s Live Stream`}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        fontSize: 15,
                        outline: 'none',
                        boxSizing: 'border-box',
                        color: C.text,
                      }}
                    />

                    {/* Description field */}
                    <label
                      style={{
                        display: 'block',
                        marginTop: 14,
                        marginBottom: 8,
                        fontWeight: 700,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What will you be playing or talking about?"
                      rows={2}
                      maxLength={200}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        fontSize: 14,
                        outline: 'none',
                        boxSizing: 'border-box',
                        color: C.text,
                        resize: 'none',
                        fontFamily: 'inherit',
                      }}
                    />

                    {/* Category selector */}
                    <label
                      style={{
                        display: 'block',
                        marginTop: 14,
                        marginBottom: 8,
                        fontWeight: 700,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        fontSize: 15,
                        outline: 'none',
                        boxSizing: 'border-box',
                        color: C.text,
                        background: 'white',
                        appearance: 'auto',
                      }}
                    >
                      <option value="general">General</option>
                      <option value="cash_game">Cash Game</option>
                      <option value="tournament">Tournament</option>
                      <option value="strategy">Strategy Talk</option>
                      <option value="hand_review">Hand Review</option>
                      <option value="just_chatting">Just Chatting</option>
                    </select>

                    {/* PHASE 2: Co-Host picker (start with 2 people) */}
                    <label
                      style={{
                        display: 'block',
                        marginTop: 14,
                        marginBottom: 8,
                        fontWeight: 700,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      Co-Host{' '}
                      <span style={{ color: C.textSec, fontWeight: 500, fontSize: 12 }}>
                        (optional — they'll get a Messenger invite when you go live)
                      </span>
                    </label>
                    {pendingCohost ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: `1px solid ${C.border}`,
                          background: '#F0F2F5',
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: pendingCohost.avatar_url
                              ? `url(${pendingCohost.avatar_url}) center/cover`
                              : 'linear-gradient(135deg, #FA383E, #FFA500)',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: C.text,
                              fontWeight: 600,
                              fontSize: 14,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {pendingCohost.display_name || pendingCohost.username}
                          </div>
                          <div style={{ color: C.textSec, fontSize: 12 }}>
                            Will be invited the moment you go live
                          </div>
                        </div>
                        <button
                          onClick={() => setPendingCohost(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: C.red,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '6px 8px',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCohostPickerOpen(true)}
                        style={{
                          width: '100%',
                          padding: '11px 14px',
                          borderRadius: 8,
                          border: `1px dashed ${C.border}`,
                          background: 'white',
                          color: C.text,
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>👥</span>
                        <span>Invite a friend to co-host</span>
                      </button>
                    )}
                  </>
                )}

                {error && <div style={{ color: C.red, marginTop: 10, fontSize: 14 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                  <button
                    onClick={onClose}
                    style={{
                      flex: 1,
                      padding: '13px 20px',
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: 'white',
                      color: C.text,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGoLive}
                    disabled={isStarting}
                    style={{
                      flex: 1,
                      padding: '13px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: C.red,
                      color: 'white',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: isStarting ? 'not-allowed' : 'pointer',
                      opacity: isStarting ? 0.6 : 1,
                    }}
                  >
                    {isStarting ? 'Starting...' : guestMode ? 'Join as Guest' : 'Go Live'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── COUNTDOWN STAGE ── */}
          {stage === 'countdown' && (
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                touchAction: 'none',
                overflow: 'hidden',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                disablePictureInPicture
                controls={false}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform:
                    `${isMirrored ? 'scaleX(-1) ' : ''}${(!zoomCapability || softwareZoomFallback) && zoomLevel !== 1 ? `scale(${zoomLevel})` : ''}`.trim() ||
                    'none',
                  opacity: 0.4,
                }}
              />
              <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 16,
                    color: 'white',
                    fontWeight: 700,
                    letterSpacing: 3,
                    marginBottom: 16,
                    textTransform: 'uppercase',
                    opacity: 0.85,
                  }}
                >
                  Get Ready
                </div>
                <div
                  style={{
                    fontSize: 140,
                    fontWeight: 900,
                    color: 'white',
                    lineHeight: 1,
                    animation: 'cdPop .5s ease-out',
                    textShadow: '0 0 60px rgba(0,120,255,.8)',
                  }}
                  key={countdown}
                >
                  {countdown}
                </div>
                <div style={{ fontSize: 16, color: 'rgba(255,255,255,.7)', marginTop: 20 }}>
                  Your stream is about to start
                </div>
              </div>
            </div>
          )}

          {/* ── LIVE STAGE ── */}
          {stage === 'live' && (
            <div
              style={{
                height: '100%',
                width: '100%',
                position: 'relative',
                background: '#000',
                cursor: 'pointer',
                touchAction: 'none',
                overflow: 'hidden',
              }}
              onClick={handleScreenTap}
            >
              {/* Broadcaster/Local Video + Remote Participants */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#000',
                }}
              >
                {/* BUG-FIX-FLIP: mirror only front-facing (user) camera */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  disablePictureInPicture
                  controls={false}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    objectFit: 'cover',
                    transform:
                      `${isMirrored ? 'scaleX(-1) ' : ''}${(!zoomCapability || softwareZoomFallback) && zoomLevel !== 1 ? `scale(${zoomLevel})` : ''}`.trim() ||
                      'none',
                    transition: 'all 0.3s ease',
                    ...(beautyMode
                      ? { filter: 'brightness(1.06) contrast(0.92) saturate(1.12) blur(0.4px)' }
                      : {}),
                  }}
                />

                {/* Secondary Participants (Guest) — BUG-FIX-5: filter out broadcaster's own identity
                     so the host video never duplicates below the primary videoRef. Host is always
                     rendered first (videoRef above) = top of the column = top of screen. */}
                {participants
                  .filter((p) => String(p.identity) !== String(user?.id))
                  .map((p, idx) => {
                    const pubs = Array.from(p.videoTrackPublications.values());
                    const videoPub = pubs.find((pub) => pub.track);
                    if (!videoPub) return null;

                    return (
                      <div
                        key={p.identity}
                        style={{ flex: 1, minHeight: 0, position: 'relative', width: '100%' }}
                      >
                        <video
                          autoPlay
                          playsInline
                          muted
                          ref={(el) => {
                            if (el && videoPub.track) {
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
                        {/* 2026-08-15 audit: broadcaster can remove a co-host at
                            any time. Guests never see this control. */}
                        {!guestMode && streamId && (
                          <button
                            onClick={async () => {
                              try {
                                await liveStreamService.revokeGuest(streamId, String(p.identity).split(':')[0]);
                                setParticipants((prev) => prev.filter((x) => x.identity !== p.identity));
                                toast.success(`Removed ${p.name || 'guest'}`);
                              } catch (e) {
                                toast.error(e?.message || 'Could not remove guest');
                              }
                            }}
                            title="Remove co-host"
                            style={{
                              position: 'absolute',
                              top: 12,
                              right: 12,
                              background: 'rgba(250,56,62,0.85)',
                              border: 'none',
                              color: 'white',
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '5px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              zIndex: 5,
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Reconnect overlay (initial 60s — auto-recovery in progress) */}
              {isReconnecting && !reconnectStuck && (
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
                  <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>
                    Reconnecting...
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6 }}>
                    Please wait
                  </div>
                </div>
              )}
              {/* Bug25: broadcaster alert when stale-cleanup ended their stream externally */}
              {streamEndedExternally && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 200,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                  }}
                >
                  <div
                    style={{
                      background: '#1C1E21',
                      borderRadius: 16,
                      padding: 28,
                      maxWidth: 340,
                      textAlign: 'center',
                      border: '1px solid rgba(255,100,100,0.4)',
                    }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
                    <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                      Stream Ended
                    </div>
                    <div style={{ color: '#aaa', fontSize: 14, marginBottom: 20 }}>
                      Your stream was automatically ended due to a connection timeout. Your
                      recording has been saved as a draft.
                    </div>
                    <button
                      onClick={() => {
                        setStreamEndedExternally(false);
                        // BUG-FIX-GLM-EXTERNALLY-ENDED-CONFIRM: stream is already ended by the cron
                        handleEndStream({ skipConfirm: true });
                      }}
                      style={{
                        background: '#1877F2',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 28px',
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      OK, Go to Recap
                    </button>
                  </div>
                </div>
              )}

              {/* STREAM-BUG-6: Stuck-reconnect popup — appears after 60s.
                            Two explicit options:
                              - Try Reconnect: resets attempt budget, retries the LiveKit handshake.
                              - End Stream: confirmed exit, hands off to handleEndStream so the
                                broadcaster can still save/post the recording. */}
              {reconnectStuck && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.82)',
                    zIndex: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                  }}
                >
                  <div
                    style={{
                      background: '#1C1E21',
                      borderRadius: 16,
                      padding: '24px 20px',
                      maxWidth: 340,
                      width: '100%',
                      textAlign: 'center',
                      boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div
                      style={{
                        color: '#FA383E',
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                        marginBottom: 8,
                      }}
                    >
                      Connection Lost
                    </div>
                    <div
                      style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 10 }}
                    >
                      Stream disrupted
                    </div>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: 14,
                        lineHeight: 1.45,
                        marginBottom: 20,
                      }}
                    >
                      We couldn't reconnect to the broadcast after 60 seconds. Try again, or end the
                      stream and save your recording.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          setReconnectStuck(false);
                          setIsReconnecting(true);
                          if (reconnectWatchdogRef.current)
                            clearTimeout(reconnectWatchdogRef.current);
                          reconnectWatchdogRef.current = setTimeout(() => {
                            reconnectWatchdogRef.current = null;
                            setIsReconnecting((prev) => {
                              if (prev) setReconnectStuck(true);
                              return prev;
                            });
                          }, 60000);
                          try {
                            await liveStreamService.forceReconnect?.();
                          } catch (err) {
                            console.warn('[GoLive] forceReconnect failed:', err?.message || err);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '14px 0',
                          borderRadius: 10,
                          border: 'none',
                          background: '#0066FF',
                          color: 'white',
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Try Reconnect
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !window.confirm(
                              'End the stream and save your recording? Your viewers will be disconnected.'
                            )
                          )
                            return;
                          setReconnectStuck(false);
                          setIsReconnecting(false);
                          if (reconnectWatchdogRef.current) {
                            clearTimeout(reconnectWatchdogRef.current);
                            reconnectWatchdogRef.current = null;
                          }
                          // BUG-FIX-GLM-RECONNECT-DOUBLE-CONFIRM: popup already called window.confirm()
                          handleEndStream({ skipConfirm: true });
                        }}
                        style={{
                          width: '100%',
                          padding: '14px 0',
                          borderRadius: 10,
                          background: 'transparent',
                          color: 'rgba(255,255,255,0.85)',
                          fontSize: 15,
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.25)',
                        }}
                      >
                        End Stream
                      </button>
                    </div>
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
                    animation: 'cdPop 0.5s ease-out',
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

              {/* TOP-LEFT: LIVE badge + REC + connection quality */}
              <div
                style={{
                  position: 'absolute',
                  top: 'max(20px, env(safe-area-inset-top, 20px))',
                  left: 16,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    background: C.red,
                    color: 'white',
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 800,
                    animation: 'livePulse 1.5s infinite',
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
                <div
                  style={{
                    background: 'rgba(255,0,0,.75)',
                    color: 'white',
                    padding: '5px 10px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  REC
                </div>
                {slowMode && (
                  <div
                    style={{
                      background: 'rgba(255,165,0,0.85)',
                      color: 'white',
                      padding: '5px 10px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    SLOW
                  </div>
                )}
                {/* #12: Recording failed warning badge */}
                {recordingFailed && (
                  <div
                    style={{
                      background: 'rgba(255,165,0,0.85)',
                      color: 'white',
                      padding: '5px 10px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    NO REC
                  </div>
                )}
                {/* Connection quality indicator */}
                <div
                  title={`Connection: ${connectionQuality}`}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background:
                      connectionQuality === 'excellent'
                        ? '#42B72A'
                        : connectionQuality === 'good'
                          ? '#42B72A'
                          : connectionQuality === 'poor'
                            ? '#FFA500'
                            : '#FA383E',
                    boxShadow: `0 0 6px ${connectionQuality === 'excellent' || connectionQuality === 'good' ? '#42B72A' : connectionQuality === 'poor' ? '#FFA500' : '#FA383E'}`,
                  }}
                />
              </div>

              {/* TOP-RIGHT: viewer count (tap to open viewer list — STREAM-BUG-11) */}
              <button
                type="button"
                onClick={() => setShowViewerList(true)}
                aria-label="Open viewer list"
                style={{
                  position: 'absolute',
                  top: 'max(20px, env(safe-area-inset-top, 20px))',
                  right: 16,
                  background: 'rgba(0,0,0,.55)',
                  color: 'white',
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" fill="white" viewBox="0 0 24 24">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                </svg>
                {viewerCount} {viewerCount === 1 ? 'viewer' : 'viewers'}
                {isMuted && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }} aria-hidden>
                    (muted)
                  </span>
                )}
              </button>

              {/* STREAM-BUG-1: clock pinned BOTTOM-LEFT, just above the chat scroll
                            zone. Chat scroll lives at bottom:110 + maxHeight:200, so its top edge
                            is at bottom:310. Placing the timer at bottom:316 puts it one row
                            above the chat. If a pinned-comment banner is occupying bottom:320,
                            the timer bumps up to bottom:380 to avoid collision. Tappable to hide;
                            when hidden, a small ⏱ chip returns in the same corner. */}
              {!timeOverlayHidden ? (
                <button
                  onClick={() => setTimeOverlayHidden(true)}
                  title="Tap to hide timer"
                  aria-label="Hide stream timer"
                  style={{
                    position: 'absolute',
                    bottom: pinnedComment ? 155 : 90,
                    left: 16,
                    background: 'rgba(0,0,0,.55)',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    zIndex: 10,
                    fontVariantNumeric: 'tabular-nums',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {formatTime(elapsedTime)}
                </button>
              ) : (
                <button
                  onClick={() => setTimeOverlayHidden(false)}
                  title="Tap to show timer"
                  aria-label="Show stream timer"
                  style={{
                    position: 'absolute',
                    bottom: pinnedComment ? 155 : 90,
                    left: 16,
                    background: 'rgba(0,0,0,.35)',
                    color: 'white',
                    padding: '6px 9px',
                    borderRadius: 8,
                    fontSize: 14,
                    zIndex: 10,
                    border: 'none',
                    cursor: 'pointer',
                    opacity: 0.55,
                  }}
                >
                  ⏱
                </button>
              )}

              {/* Stream description (visible to broadcaster) */}
              {description && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'max(56px, calc(env(safe-area-inset-top, 20px) + 36px))',
                    left: 16,
                    right: 80,
                    zIndex: 8,
                    background: 'rgba(0,0,0,0.45)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    maxWidth: '60vw',
                  }}
                >
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: 11,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {description}
                  </div>
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

              {/* STREAM-BUG-11: viewer list sheet for the broadcaster.
                            Tapping the top-right viewer-count badge opens this.
                            LiveViewerList already supports search + invite when
                            currentUser + inviteCode are present (see component). */}
              <LiveViewerList
                streamId={streamId}
                viewerCount={viewerCount}
                isOpen={showViewerList}
                onClose={() => setShowViewerList(false)}
                currentUser={user}
                inviteCode={guestInviteCode}
              />

              {/* #18: PINNED COMMENT */}
              {pinnedComment && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 320,
                    left: 12,
                    right: 80,
                    zIndex: 10,
                    background: 'rgba(0,0,0,0.7)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    border: '1px solid rgba(255,215,0,0.3)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 700 }}>PINNED</span>
                    <button
                      onClick={() => {
                        setPinnedComment(null);
                        liveStreamService.unpinComment(streamId, guestMode ? guestInviteCode : null).catch((err) => toast.error(err?.message || 'Unpin failed'));
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 14,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <span style={{ color: '#00CFFF', fontWeight: 700, fontSize: 12, marginRight: 6 }}>
                    {pinnedComment.author_name}
                  </span>
                  <span style={{ color: 'white', fontSize: 12 }}>{pinnedComment.text}</span>
                </div>
              )}

              {/* Feature 5: Top Supporters Leaderboard */}
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
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#FFD700',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    Top Supporters
                  </div>
                  {Object.entries(topGifters)
                    .sort(([, { amount: a }], [, { amount: b }]) => b - a)
                    .slice(0, 3)
                    .map(([userId, { name, amount }], idx) => (
                      <div
                        key={userId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 13,
                          color: 'white',
                          marginBottom: 4,
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{ opacity: 0.9, display: 'flex', gap: 6, alignItems: 'center' }}
                        >
                          <span style={{ fontSize: 11, opacity: 0.7 }}>#{idx + 1}</span> {name}
                        </span>
                        <span style={{ fontWeight: 700, color: '#00CFFF' }}>{amount} 💎</span>
                      </div>
                    ))}
                </div>
              )}

              {/* COMMENTS OVERLAY — left side, scrollable */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 110,
                  left: 0,
                  width: 'min(320px, 60vw)',
                  maxHeight: 200,
                  overflowY: 'auto',
                  zIndex: 10,
                  padding: '0 12px',
                  scrollbarWidth: 'none',
                }}
              >
                {comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      animation: 'slideUp .25s ease-out',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                      position: 'relative',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommentMenu(commentMenu === c.id ? null : c.id);
                    }}
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
                      {c.author_name}
                    </span>
                    <span
                      style={{
                        color: 'white',
                        fontSize: 13,
                        lineHeight: 1.4,
                        flex: 1,
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {c.text}
                    </span>
                    {/* #18/#19: Comment actions (broadcaster only) */}
                    {commentMenu === c.id && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPinnedComment(c);
                            setCommentMenu(null);
                            liveStreamService.pinComment(streamId, c.id, guestMode ? guestInviteCode : null).catch((err) => toast.error(err?.message || 'Pin failed'));
                          }}
                          title="Pin comment"
                          style={{
                            background: 'rgba(255,215,0,0.3)',
                            border: 'none',
                            color: '#FFD700',
                            fontSize: 11,
                            padding: '3px 7px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Pin
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setComments((prev) => prev.filter((x) => x.id !== c.id));
                            setCommentMenu(null);
                            liveStreamService.deleteComment(c.id, guestMode ? guestInviteCode : null).catch((err) => toast.error(err?.message || 'Delete failed'));
                          }}
                          title="Delete comment"
                          style={{
                            background: 'rgba(250,56,62,0.3)',
                            border: 'none',
                            color: '#FA383E',
                            fontSize: 11,
                            padding: '3px 7px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Del
                        </button>
                        {!guestMode && c.user_id !== user?.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              liveStreamService.banUser(streamId, c.user_id).catch((err) => toast.error(err?.message || 'Ban failed'));
                              setCommentMenu(null);
                              setComments((prev) => prev.filter((x) => x.user_id !== c.user_id));
                            }}
                            title="Ban user"
                            style={{
                              background: 'rgba(250,56,62,0.5)',
                              border: 'none',
                              color: 'white',
                              fontSize: 11,
                              padding: '3px 7px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Ban
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>

              {/* COMMENT INPUT */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
                  left: 12,
                  right: 56,
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
                    e.stopPropagation();
                    if (e.key === 'Enter') handleSendComment();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Say something..."
                  // STREAM-BUG-12a: fontSize must be ≥16px. iOS Safari auto-zooms
                  // when a tapped input has font-size <16px, which Dan saw as the
                  // page zooming in AND broke perceived typing because the input
                  // gets re-positioned offscreen during the zoom animation.
                  style={{
                    flex: 1,
                    padding: '9px 14px',
                    borderRadius: 22,
                    border: '1.5px solid rgba(255,255,255,.3)',
                    background: 'rgba(0,0,0,.45)',
                    color: 'white',
                    fontSize: 16,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSendComment();
                  }}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 22,
                    border: 'none',
                    background: 'rgba(0,120,255,.85)',
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Send
                </button>
              </div>

              {/* FLOATING ACTION BUTTONS — camera flip, share, slow mode */}
              {/* BUG-FIX-LIVE-LIST-1: safe-area-aware bottom (above the input row),
                            cap max-height + scroll-y so the strip never clips off-screen on
                            phones with notch/home-bar regardless of how many buttons render. */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(64px + max(16px, env(safe-area-inset-bottom, 0px)))',
                  right: 16,
                  maxHeight:
                    'calc(100vh - 200px - max(16px, env(safe-area-inset-top, 0px)) - max(16px, env(safe-area-inset-bottom, 0px)))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  zIndex: 15,
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                }}
              >
                {/* Camera flip */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFlipCamera();
                  }}
                  disabled={isCameraFlipping}
                  title="Flip camera"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    color: 'white',
                    fontSize: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isCameraFlipping ? 0.5 : 1,
                  }}
                >
                  🔄
                </button>
                {/* BUG-FIX-LIVE2-1b: zoom slider trigger. Only rendered when the
                                device's video track exposes a zoom capability. Tap toggles a
                                vertical slider overlay anchored to this button. */}
                {/* STREAM-BUG-2: zoom UI is now ALWAYS rendered. Previously it
                                was gated on `zoomCapability` truthy, but most webcams (and
                                many iOS Safari versions) don't expose getCapabilities().zoom,
                                so Dan saw no zoom button at all and reported "zoom doesn't
                                work." When hardware zoom IS supported, applyZoom calls
                                track.applyConstraints({ advanced:[{ zoom }] }) which zooms
                                the published stream so viewers see it too. When hardware
                                zoom is NOT supported, we fall back to a CSS scale() on the
                                local preview <video> (broadcast remains unzoomed in that
                                case — labeled "preview-only" in the slider). Either way,
                                Dan now has a visible, working zoom control. */}
                {(() => {
                  const zMin = zoomCapability?.min ?? 1;
                  const zMax = zoomCapability?.max ?? 3;
                  const zStep = zoomCapability?.step ?? 0.1;
                  const isSoftware = !zoomCapability;
                  return (
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomSliderOpen((prev) => !prev);
                        }}
                        title={isSoftware ? 'Zoom (preview only)' : 'Zoom'}
                        aria-label="Zoom"
                        aria-pressed={zoomSliderOpen}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          border: 'none',
                          background: zoomSliderOpen ? 'rgba(0, 102, 255, 0.6)' : 'rgba(0,0,0,0.6)',
                          backdropFilter: 'blur(8px)',
                          color: 'white',
                          fontSize: 16,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {/* BUG-FIX-ZOOM-ICON: replaced confusing "{zoomLevel}×" label
                           with a magnifying glass so users immediately recognize this
                           as a zoom control. The numeric level is shown inside the
                           slider popover when expanded. */}
                        🔍
                      </button>
                      {zoomSliderOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: 52,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0,0,0,0.85)',
                            backdropFilter: 'blur(12px)',
                            padding: '14px 12px',
                            borderRadius: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 8,
                            minWidth: 60,
                          }}
                        >
                          <div style={{ color: 'white', fontSize: 11, opacity: 0.7 }}>
                            {zMax.toFixed(1)}×
                          </div>
                          <input
                            type="range"
                            min={zMin}
                            max={zMax}
                            step={zStep}
                            value={zoomLevel}
                            onChange={(e) => applyZoom(parseFloat(e.target.value))}
                            onInput={(e) => applyZoom(parseFloat(e.target.value))}
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => e.stopPropagation()}
                            style={{
                              // Vertical slider via writingMode; touchAction must allow vertical
                              // pan so the drag registers on iOS despite parent touchAction:none
                              writingMode: 'vertical-lr',
                              WebkitAppearance: 'slider-vertical',
                              width: 6,
                              height: 140,
                              cursor: 'pointer',
                              accentColor: '#FA383E',
                              touchAction: 'pan-y',
                            }}
                          />
                          <div style={{ color: 'white', fontSize: 11, opacity: 0.7 }}>
                            {zMin.toFixed(1)}×
                          </div>
                          <div
                            style={{ color: 'white', fontSize: 13, fontWeight: 700, marginTop: 2 }}
                          >
                            {zoomLevel.toFixed(1)}×
                          </div>
                          {isSoftware && (
                            <div
                              style={{
                                color: 'rgba(255,255,255,0.55)',
                                fontSize: 9,
                                marginTop: 2,
                                lineHeight: 1.2,
                                textAlign: 'center',
                                maxWidth: 70,
                              }}
                            >
                              preview only
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Share button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare();
                  }}
                  title="Share stream link"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    color: 'white',
                    fontSize: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  📤
                </button>
                {/* 2026-08-15 audit: let the BROADCASTER and GUESTS post the live
                    stream to their own feed (was reachable only from the viewer
                    surface). */}
                {streamId && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const { getFreshAccessToken, getAccessToken } = await import('../../lib/authUtils');
                        const token = (await getFreshAccessToken()) || getAccessToken();
                        const resp = await fetch('/api/live/share-stream-to-feed', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                          body: JSON.stringify({ stream_id: streamId }),
                        });
                        const data = await resp.json().catch(() => ({}));
                        toast[resp.ok ? 'success' : 'error'](
                          resp.ok ? (data.already_shared ? 'Already on your feed' : 'Posted to your feed') : (data.error || 'Could not post')
                        );
                      } catch (err) {
                        toast.error('Could not post to feed');
                      }
                    }}
                    title="Post to my feed"
                    style={{
                      width: 44, height: 44, borderRadius: '50%', border: 'none',
                      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                      color: 'white', fontSize: 18, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    📣
                  </button>
                )}
                {/* BUG-FIX-LIVE-DUP-INVITE: removed duplicate "Invite Guest" button.
                   The 📤 share button above already opens GuestInviteModal when
                   guestInviteCode is present — this was a second, redundant path
                   to the exact same modal. Dan flagged as "duplicate invite guests
                   under the email." */}
                {/* BUG-FIX-LIVE-FILTER-REMOVED: beauty filter button removed per Dan.
                   "Filters should just be automatically applied — and they don't even
                   work." beautyMode defaults to true (line 513) and the canvas-based
                   filter in the useEffect (line 669) auto-applies brightness/contrast/
                   saturation/blur to the outgoing LiveKit track. No toggle needed. */}

                {/* Mic mute/unmute */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleMute();
                  }}
                  title={isMuted ? 'Unmute mic' : 'Mute mic'}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: 'none',
                    background: isMuted ? 'rgba(250,56,62,0.7)' : 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    color: 'white',
                    fontSize: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isMuted ? '🔇' : '🎙️'}
                </button>
              </div>

              {/* TAP-TO-REVEAL: End Stream — only visible when showControls */}
              {/* BUG-FIX-LIVE2-3b: guests show "Leave Stream" not "End Stream".
                            Tapping it must only disconnect them, not end the host's
                            broadcast. handleEndStream branches on guestMode below. */}
              {showControls && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%,-50%)',
                    zIndex: 20,
                    animation: 'slideUp .2s ease-out',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEndStream();
                    }}
                    style={{
                      background: guestMode ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.92)',
                      color: guestMode ? '#444' : C.red,
                      border: 'none',
                      padding: '15px 36px',
                      borderRadius: 32,
                      fontSize: 17,
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 24px rgba(0,0,0,.4)',
                      letterSpacing: 0.5,
                    }}
                  >
                    {guestMode ? 'Leave Stream' : 'End Stream'}
                  </button>
                  <div
                    style={{
                      textAlign: 'center',
                      marginTop: 10,
                      color: 'rgba(255,255,255,.6)',
                      fontSize: 12,
                    }}
                  >
                    {guestMode
                      ? 'You will leave; the host\u2019s stream continues'
                      : 'Tap anywhere to hide'}
                  </div>
                </div>
              )}

              {/* BUG FIX (GLM-3): use dedicated shareToast state, not error state */}
              {shareToast && (
                <div
                  style={{
                    position: 'absolute',
                    top: 70,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0,200,100,0.9)',
                    color: 'white',
                    padding: '8px 20px',
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 600,
                    zIndex: 30,
                  }}
                >
                  {shareToast}
                </div>
              )}
            </div>
          )}

          {/* Setup / permission error */}
          {stage === 'setup' && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 20 }}>📹</div>
              <h3 style={{ margin: '0 0 12px', color: C.text }}>Camera Access Required</h3>
              <p style={{ color: C.textSec, margin: '0 0 20px', fontSize: 14 }}>
                Allow camera and microphone to go live.
              </p>
              {error && (
                <div style={{ color: C.red, marginBottom: 16, fontSize: 14 }}>⚠️ {error}</div>
              )}
              <button
                onClick={requestMediaAccess}
                style={{
                  background: C.red,
                  color: 'white',
                  border: 'none',
                  padding: '12px 28px',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
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

      {/* PHASE 2: Co-Host picker — mounted at top level so it overlays the
            preview stage too (the inner mount inside the live-stage block was
            only reachable after going live, defeating the purpose). */}
      <CohostPickerModal
        isOpen={cohostPickerOpen}
        onClose={() => setCohostPickerOpen(false)}
        currentUser={user}
        onPick={(friend) => setPendingCohost(friend)}
      />
    </>
  );
}

export default GoLiveModal;
