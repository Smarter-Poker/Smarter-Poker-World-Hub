/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  LIVE STREAM SERVICE v2 — LiveKit SFU Architecture                        ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  CRITICAL UPGRADE: Replaced peer-to-peer WebRTC with LiveKit SFU.         ║
 * ║  Old architecture: broadcaster → N direct connections to N viewers         ║
 * ║  New architecture: broadcaster → LiveKit SFU → N viewers (CDN scale)       ║
 * ║                                                                            ║
 * ║  LiveKit Cloud: wss://smarter-poker-lovt9xq0.livekit.cloud                ║
 * ║  Token API: /api/live/token                                                ║
 * ║                                                                            ║
 * ║  KEY METHODS:                                                              ║
 * ║  - startBroadcast() → Creates LK room, publishes camera+mic               ║
 * ║  - endBroadcast()  → Disconnects room, updates DB                         ║
 * ║  - joinStream()    → Viewer connects to LK room, subscribes               ║
 * ║  - leaveStream()   → Viewer disconnects                                    ║
 * ║  - flipCamera()    → Toggle front/back camera                              ║
 * ║  - setSlowMode()   → Toggle slow mode for comments                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';
import { supabase } from '../lib/supabase';
import { getAccessToken, getFreshAccessToken } from '../lib/authUtils';
import { busEmit } from '../engine/EventBus';

const logError = (ctx, err) => console.warn(`[LiveStream:${ctx}]`, err?.message || err);

// Reconnect settings
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

// BUG-FIX-DEEP-AUDIT-R2 GUEST-1: live_streams.guest_invite_code is the secret
// that grants co-host publish privileges in /api/live/token. After the v2
// column-grant lockdown migration (20260510235100) end-user roles cannot
// SELECT that column at all — they get `permission denied for table
// live_streams` if it appears anywhere in the column list. Every direct
// client SELECT must therefore enumerate the safe-columns list (no `*`).
// This constant matches the GRANT SELECT (...) column set in that migration.
// The broadcaster's own code is fetched via fn_get_my_guest_invite_code RPC.
const LIVE_STREAM_SAFE_COLS =
  'id, broadcaster_id, title, description, thumbnail_url, status, viewer_count, started_at, ended_at, created_at, video_url, is_posted, is_draft, mime_type, livekit_room, slow_mode, peak_viewers, reaction_count, category, feed_post_id, preview_clip_url, preview_updated_at';

/**
 * LiveStreamService v2 — LiveKit SFU
 */
class LiveStreamService {
  constructor() {
    this.room = null;
    this.localStream = null; // Raw MediaStream (for recording)
    this.currentStreamId = null;
    this.currentUserId = null;
    this.cameraMode = 'user'; // 'user' (front) | 'environment' (back)
    this.isBroadcaster = false;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.isManualDisconnect = false; // FIX: was undefined, causing spurious reconnect
    this.onRemoteStream = null;
    this._viewerChannel = null; // FIX: viewer subscription channel ref for cleanup
    this._remoteStreamDelivered = false; // FIX: guard double onRemoteStream fire

    // Callbacks
    this.onViewerCountChange = null;
    this.onStreamEnded = null;
    this.onReconnecting = null;
    this.onReconnected = null;
    this.onParticipantListChange = null;
    this.onParticipantsUpdate = null; // FEATURE 6: Expose participant map for split-screen
    this.onStreamEndedExternally = null; // Bug25: broadcaster notified when stream is externally ended
    this.onConnectionQualityChange = null;
    this.onGiftReceived = null;
    this.onDataReceived = null; // Broadcast command/message handler
    // BUG-FIX-AUDIT LSS-1: declare onTrackAdded alongside all other callbacks.
    // Previously absent from constructor — started as `undefined` instead of `null`,
    // breaking any `=== null` unregistered-callback check and silently diverging
    // from the documented callback contract. Used in _connectRoom TrackSubscribed
    // to force-reassign srcObject on mobile when video track arrives after audio.
    this.onTrackAdded = null;
    // BUG-FIX-AUDIT LSS-3: guestInviteCode must start null so _handleUnexpectedDisconnect
    // never sends a stale invite code for plain viewers or after a session ends.
    // Cleared in leaveStream/endBroadcast to prevent bleed into subsequent sessions.
    this.guestInviteCode = null;
    this._viewerCountDebounceTimer = null;
    // NOTE: _giftChannel is intentionally absent — gift broadcast channels are
    // managed by React component refs (GoLiveModal / LiveStreamViewer) to tie
    // their lifecycle to the component, not the singleton service.

    // BUG FIX: Global beforeunload listener to guarantee cleanup on tab close.
    // Because LiveStreamViewer no longer unmounts on navigation (due to Global PiP),
    // we MUST intercept tab closures globally to prevent zombie viewers and stranded streams.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.currentStreamId) {
          if (this.isBroadcaster) {
            this.endBroadcast();
          } else {
            this.leaveStream();
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════
  // TOKEN
  // ═══════════════════════════════════════════════════

  /**
   * BUG-FIX-LIVE-LIST-8a: detect orphaned broadcaster state.
   * Returns the persisted state if a previous session ended without
   * cleanup AND the live_streams row is still status='live'.
   * Caller (GoLiveModal mount) uses this to offer "Resume Live Stream?".
   *
   * Stream rows older than the LiveKit token TTL (8h) are guaranteed
   * zombies — we don't offer resume for those, just clear the state.
   */
  static async detectOrphanedBroadcast(userId) {
    if (typeof localStorage === 'undefined') return null;
    let persisted;
    try {
      const raw = localStorage.getItem('liveBroadcasterState');
      if (!raw) return null;
      persisted = JSON.parse(raw);
    } catch (_) {
      try {
        localStorage.removeItem('liveBroadcasterState');
      } catch (_) {}
      return null;
    }
    if (!persisted?.streamId || persisted.broadcasterId !== userId) {
      // Stale state from a different user — clear it.
      try {
        localStorage.removeItem('liveBroadcasterState');
      } catch (_) {}
      return null;
    }
    // Older than 8h = zombie, can't resume (LiveKit token expired anyway).
    const ageMs = Date.now() - (persisted.startedAt || 0);
    if (ageMs > 8 * 60 * 60 * 1000) {
      try {
        localStorage.removeItem('liveBroadcasterState');
      } catch (_) {}
      return null;
    }
    // Verify the DB row is still status='live'. If not, our previous
    // endBroadcast or the stale-cleanup cron already finished it.
    const { data: row } = await supabase
      .from('live_streams')
      .select('id, status, started_at')
      .eq('id', persisted.streamId)
      .maybeSingle();
    if (!row || row.status !== 'live') {
      try {
        localStorage.removeItem('liveBroadcasterState');
      } catch (_) {}
      return null;
    }
    return persisted;
  }

  /**
   * BUG-FIX-LIVE-LIST-8a: explicit dismissal of an orphaned broadcast.
   * If the user chooses "End it instead of resuming", we mark the row
   * ended and clear localStorage. Idempotent.
   */
  static async dismissOrphanedBroadcast(streamId) {
    if (!streamId) return;
    try {
      const { error: err_live_streams_3zo42 } = await supabase
        .from('live_streams')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', streamId)
        .eq('status', 'live');
      if (err_live_streams_3zo42) console.warn('[Supabase] Silent mutation failed in live_streams:', err_live_streams_3zo42.message);
    } catch (_) {
      /* non-fatal */
    }
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('liveBroadcasterState');
    } catch (_) {}
  }

  async _getToken(streamId, broadcaster, guestInviteCode = null) {
    const token = getAccessToken();
    const resp = await fetch('/api/live/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'same-origin',
      // BUG-FIX-LIVE-API-AUDIT (C1): identity is now server-derived from
      // the auth.uid() of the bearer token. Don't send it from the client.
      body: JSON.stringify({
        room: streamId,
        broadcaster,
        guestInviteCode,
      }),
    });
    if (!resp.ok) throw new Error(`Token fetch failed: ${resp.status}`);
    return resp.json(); // { token, url }
  }

  // ═══════════════════════════════════════════════════
  // BROADCASTER
  // ═══════════════════════════════════════════════════

  /**
   * Start broadcasting
   * @param {string} userId
   * @param {string} title
   * @param {MediaStream} mediaStream - Pre-acquired camera+mic stream
   * @param {string|null} thumbnailUrl
   * @param {string} category - Stream category tag
   * @param {string} description - Optional stream description
   */
  async startBroadcast(userId, title, mediaStream, thumbnailUrl, category, description) {
    this.currentUserId = userId;
    this.localStream = mediaStream;
    this.isBroadcaster = true;
    this.isManualDisconnect = false; // FIX: reset so reconnect works for new broadcast
    this.reconnectAttempts = 0;

    // 1. Create stream record in Supabase
    const insertPayload = {
      broadcaster_id: userId,
      title: title || 'Live Stream',
      // BUG-FIX-PRE-FLIGHT: Insert as ended/draft so it is invisible to viewers and
      // social feed until the WebRTC connection is 100% established.
      status: 'ended',
      is_draft: true,
      category: category || 'general',
    };
    if (thumbnailUrl) insertPayload.thumbnail_url = thumbnailUrl;
    if (description) insertPayload.description = description;

    // BUG-FIX-PRE-FLIGHT: Explicitly kill any zombie live streams before we create the new one.
    // This prevents the unique index on (broadcaster_id) WHERE status='live' from blocking
    // our subsequent update from 'ended' -> 'live' after the WebRTC connection connects.
    try {
      const { data: existing } = await supabase
        .from('live_streams')
        .select('id')
        .eq('broadcaster_id', userId)
        .eq('status', 'live')
        .maybeSingle();

      if (existing) {
        const { error: err_live_streams_yd7f3 } = await supabase.from('live_streams').update({ status: 'ended' }).eq('id', existing.id);
        if (err_live_streams_yd7f3) console.warn('[Supabase] Silent mutation failed in live_streams:', err_live_streams_yd7f3.message);
      }
    } catch (_) {}

    let { data: stream, error } = await supabase
      .from('live_streams')
      .insert(insertPayload)
      // BUG-FIX-DEEP-AUDIT-R2 GUEST-1: enumerate safe columns.
      .select(LIVE_STREAM_SAFE_COLS)
      .maybeSingle();

    if (error || !stream) {
      throw new Error(`Failed to create stream: ${error?.message || 'no row returned'}`);
    }

    this.currentStreamId = stream.id;

    // BUG-FIX-DEEP-AUDIT-R2 GUEST-1: fetch the broadcaster's own guest
    // invite code via the SECURITY DEFINER RPC. The column itself is no
    // longer SELECT-able from a client. The RPC checks auth.uid() ==
    // broadcaster_id and returns NULL otherwise. We tolerate NULL here
    // (rare race / RLS regression) — the co-host invite UI will simply
    // tell the broadcaster the code isn't ready yet and offer a retry.
    let guestInviteCode = null;
    try {
      const { data: codeData } = await supabase.rpc('fn_get_my_guest_invite_code', {
        p_stream_id: stream.id,
      });
      guestInviteCode = codeData ?? null;
    } catch (codeErr) {
      console.warn('[LiveStream] guest_invite_code fetch failed:', codeErr?.message || codeErr);
    }
    stream.guest_invite_code = guestInviteCode;

    // BUG-FIX-LIVE-LIST-8a: persist active broadcast state to localStorage
    // so if the broadcaster's phone dies / app crashes / they reload the
    // page, the next mount can detect their dangling 'live' row and offer
    // "Resume Live Stream?" instead of stranding it as a zombie that
    // viewers see as 'still live' but with frozen video.
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'liveBroadcasterState',
          JSON.stringify({
            streamId: stream.id,
            broadcasterId: userId,
            title: title || 'Live Stream',
            startedAt: Date.now(),
          })
        );
      }
    } catch (_) {
      /* localStorage disabled (Safari private mode) — non-fatal */
    }

    // 2. Update record with LiveKit room name (= stream id)
    const { error: err_live_streams_nf2p4 } = await supabase.from('live_streams').update({ livekit_room: stream.id }).eq('id', stream.id);
    if (err_live_streams_nf2p4) console.warn('[Supabase] Silent mutation failed in live_streams:', err_live_streams_nf2p4.message);

    // BUG-FIX-GHOST-STREAM: Steps 3–6 wrapped in try/catch so that if LiveKit
    // connection fails (e.g. invalid API key, network error), we immediately
    // rollback: delete the DB row and the premature feed post. Previously a
    // connection failure left status='live' forever — viewers saw the live card,
    // got notifications, but the broadcaster had no actual connection.
    try {
      // 3. Get LiveKit token and connect
      const { token, url } = await this._getToken(stream.id, true);
      await this._connectRoom(url, token, true, mediaStream);

    // BUG-FIX-PRE-FLIGHT: WebRTC Connection established! Now reveal the stream to the world.
    const { error: liveFlipErr } = await supabase
      .from('live_streams')
      .update({ status: 'live', is_draft: false })
      .eq('id', stream.id);

    if (liveFlipErr) {
      throw new Error(`Failed to flip stream status to live: ${liveFlipErr.message}`);
    }
      
    stream.status = 'live'; // Update local object so subsequent logic works correctly

    } catch (connectErr) {
      // ── ROLLBACK ──────────────────────────────────────────────────────────
      console.warn(
        '[LiveStream] _connectRoom failed — rolling back stream row:',
        connectErr?.message || connectErr
      );
      try {
        const rollbackToken = getAccessToken();
        fetch('/api/live/end-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(rollbackToken ? { Authorization: `Bearer ${rollbackToken}` } : {}),
          },
          credentials: 'same-origin',
          keepalive: true,
          body: JSON.stringify({ stream_id: stream.id, action: 'delete' }),
        }).catch(() => {});
      } catch (_) {}
      // Clear localStorage so orphan-detect doesn't offer a resume
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('liveBroadcasterState');
      } catch (_) {}
      // Reset service state so the next attempt starts clean
      this.currentStreamId = null;
      this.isBroadcaster = false;
      this.localStream = null;
      // Re-throw so GoLiveModal catches it and shows the error to the user
      throw connectErr;
    }

    // 4. Subscribe to viewer count changes (only after confirmed connection)
    this._subscribeToViewers(stream.id);

    // 5. Notify followers (only after confirmed connection)
    this._notifyFollowers(userId, title || 'Live Stream', stream.id);

    // 6. Create feed post so the live stream appears in the news feed
    this._createLiveFeedPost(stream.id, title || 'Live Stream');

    // HARDENING: start broadcaster keepalive so backgrounded tabs don't lose
    // the stream due to StreamPreviewCapture being throttled by the browser.
    // This pings /api/live/heartbeat every 60s, independent of preview capture.
    this._startBroadcasterHeartbeat(stream.id);

    console.debug('🔴 LiveKit broadcast started:', stream.id);
    return { streamId: stream.id, stream, guestInviteCode: stream.guest_invite_code };
  }

  /**
   * Join as Guest Co-Broadcaster
   */
  async joinAsGuest(userId, streamId, guestInviteCode, mediaStream) {
    this.currentUserId = userId;
    this.localStream = mediaStream;
    this.isBroadcaster = true;
    this.isManualDisconnect = false;
    this.reconnectAttempts = 0;
    this.currentStreamId = streamId;
    this.guestInviteCode = guestInviteCode;

    // Get LiveKit token and connect
    // BUG FIX: isBroadcaster must be false so the server recognizes them as a guest,
    // otherwise the server checks for broadcaster_id and throws a 403.
    const { token, url } = await this._getToken(streamId, false, guestInviteCode);
    await this._connectRoom(url, token, true, mediaStream);

    console.debug('👥 Joined as guest co-broadcaster:', streamId);
    return { streamId };
  }

  /**
   * Connect to a LiveKit room
   */
  async _connectRoom(url, token, isBroadcaster, mediaStream) {
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true, // Automatically adjust quality
      publishDefaults: {
        simulcast: true, // Feature 4: Enable simulcast for manual resolution control
        videoResolution: VideoPresets.h720,
      },
    });

    // Room event handlers
    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.warn('[LiveKit] Disconnected:', reason);
      if (!this.isManualDisconnect) {
        this._handleUnexpectedDisconnect();
      }
    });

    this.room.on(RoomEvent.DataReceived, (payload, participant, kind) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        console.debug('[LiveKit] Data received:', data, 'from:', participant?.identity);
        this.onDataReceived?.(data, participant);
      } catch (err) {
        console.warn('[LiveKit] Error parsing data message:', err);
      }
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      console.debug('[LiveKit] Reconnecting...');
      this.onReconnecting?.();
    });

    this.room.on(RoomEvent.Reconnected, () => {
      console.debug('[LiveKit] Reconnected!');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.onReconnected?.();
    });

    this.room.on(RoomEvent.ParticipantConnected, () => {
      this._debouncedUpdateViewerCount();
      this.onParticipantListChange?.(this._getParticipants());
    });

    this.room.on(RoomEvent.ParticipantDisconnected, () => {
      this._debouncedUpdateViewerCount();
      this.onParticipantListChange?.(this._getParticipants());
    });

    // Connection quality tracking
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (participant.isLocal) {
        this.onConnectionQualityChange?.(quality);
      }
    });

    // Track subscriptions (for viewers)
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      // BUG FIX: Audio or video can arrive first. Initialize stream if it doesn't exist,
      // then add the incoming track.
      if (!this._remoteMediaStream) {
        this._remoteMediaStream = new MediaStream();
      }
      if (track.mediaStreamTrack) {
        this._remoteMediaStream.addTrack(track.mediaStreamTrack);
      }
      if (!this._remoteStreamDelivered && this._remoteMediaStream.getTracks().length > 0) {
        this._remoteStreamDelivered = true;
        this.onRemoteStream?.(this._remoteMediaStream);
      }
      this.onParticipantsUpdate?.(Array.from(this.room.remoteParticipants.values()));

      // BUG FIX (V-VIDEO-1): Many mobile browsers (iOS Safari, Chrome Android)
      // do NOT render video tracks dynamically added to an already-assigned
      // srcObject. If the initial delivery only had audio (audio arrived first),
      // the <video> element keeps showing black even though the video track was
      // added to the MediaStream. Fire onTrackAdded so the viewer component can
      // force-reassign srcObject to trigger the browser to re-evaluate tracks.
      if (this._remoteStreamDelivered && track.kind === Track.Kind.Video) {
        this.onTrackAdded?.(this._remoteMediaStream, 'video');
      }

      // Attach audio tracks — LiveKit requires explicit attach() for audio playback
      if (track.kind === Track.Kind.Audio) {
        try {
          // Use LiveKit's built-in attach for reliable cross-browser audio
          const audioEl = track.attach();
          audioEl.id = `livekit-audio-${participant.sid}`;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
        } catch (audioErr) {
          console.warn('[LiveKit] Audio attach error:', audioErr);
        }
      }
    });

    // Detach audio elements when tracks are unsubscribed
    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        try {
          const els = track.detach();
          els.forEach((el) => el.remove());
        } catch (_) {}
      }
    });

    await this.room.connect(url, token, {
      autoSubscribe: true, // BUG FIX: Must be true so broadcaster can see guests!
    });

    // Publish local tracks if broadcaster
    // FIX: createLocalTracks() opens a SECOND camera session — wasteful and causes
    // permission prompts on some browsers. Publish the existing raw MediaStreamTracks
    // directly via localParticipant.publishTrack(), which livekit-client v2 supports.
    if (isBroadcaster && mediaStream) {
      try {
        const videoTrack = mediaStream.getVideoTracks()[0];
        const audioTrack = mediaStream.getAudioTracks()[0];
        if (videoTrack) {
          await this.room.localParticipant.publishTrack(videoTrack, {
            name: 'camera',
            simulcast: true, // Feature 4: Enable simulcast
            videoResolution: VideoPresets.h720,
          });
        }
        if (audioTrack) {
          await this.room.localParticipant.publishTrack(audioTrack, { name: 'mic' });
        }
      } catch (pubErr) {
        console.warn('[LiveKit] Track publish error:', pubErr.message);
      }
    }
  }

  /**
   * Handle unexpected disconnection with auto-reconnect
   */
  async _handleUnexpectedDisconnect() {
    if (this.isReconnecting || this.isManualDisconnect) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[LiveKit] Max reconnect attempts reached');
      this.onStreamEnded?.();
      // Force teardown so the DB status is updated to 'ended'
      if (this.isBroadcaster) {
        this.endBroadcast().catch(() => {});
      } else {
        this.leaveStream().catch(() => {});
      }
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    this.onReconnecting?.();

    console.debug(
      `[LiveKit] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`
    );

    // BUG-FIX-DEEP-AUDIT-R4 RECON-2: exponential backoff replaces
    // the prior linear backoff (RECONNECT_DELAY_MS * attempts =
    // 2/4/6/8/10s). Linear hammers a struggling LiveKit server too
    // hard. 2s/4s/8s/16s/32s gives the server time to recover on
    // longer outages while still being snappy for transient blips.
    const backoffMs = RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
    await new Promise((r) => setTimeout(r, backoffMs));

    try {
      // BUG-FIX-AUDIT LSS-2: guest co-hosts have this.isBroadcaster=true (they publish
      // tracks) but the token API must receive broadcaster=false for guests — otherwise
      // the server checks broadcaster_id and returns 403. Detect guests by the presence
      // of guestInviteCode (only set by joinAsGuest). Primary broadcasters have
      // guestInviteCode=null so this condition correctly passes true for them.
      const isBroadcasterForToken = this.isBroadcaster && !this.guestInviteCode;
      const { token, url } = await this._getToken(
        this.currentStreamId,
        isBroadcasterForToken,
        this.guestInviteCode
      );
      // FIX: disconnect the old Room before creating a new one to prevent room leak
      if (this.room) {
        this.room.disconnect().catch(() => {});
        this.room = null;
      }
      // FIX: reset stream guard so TrackSubscribed can deliver the new remote stream
      this._remoteStreamDelivered = false;
      // FIX: clean up stale audio elements and old remote stream from the previous session
      // to prevent track accumulation across reconnect cycles.
      document.querySelectorAll('[id^="livekit-audio-"]').forEach((el) => el.remove());
      this._remoteMediaStream = null;
      await this._connectRoom(url, token, this.isBroadcaster, this.localStream);
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.onReconnected?.();
    } catch (err) {
      logError('reconnect', err);
      this.isReconnecting = false; // FIX: reset so recursive call isn't blocked by guard
      this._handleUnexpectedDisconnect(); // Try again
    }
  }

  /**
   * STREAM-BUG-6: Manual reconnect entry point for the UI.
   *
   * Called when the broadcaster taps "Try Reconnect" on the stuck-stream
   * popup. Resets reconnectAttempts so the user gets a fresh budget
   * (otherwise the prior 5 attempts would have already exhausted MAX and
   * _handleUnexpectedDisconnect would immediately give up again), clears
   * the isReconnecting guard so the recursion isn't blocked, and
   * re-invokes the same disconnect-recovery path.
   *
   * Idempotent — if there's no active stream, returns without doing
   * anything. The inner _handleUnexpectedDisconnect handles the
   * "already reconnecting" case via its own guard.
   */
  async forceReconnect() {
    if (!this.currentStreamId) return;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.isManualDisconnect = false;
    return this._handleUnexpectedDisconnect();
  }

  /**
   * Flip camera between front and back
   */
  async flipCamera() {
    if (!this.room || !this.isBroadcaster) return;

    this.cameraMode = this.cameraMode === 'user' ? 'environment' : 'user';

    try {
      // BUG-FIX-PERM: request ONLY video so we never trigger a new microphone
      // permission prompt. Audio stays on the existing track in localStream.
      // Using ideal constraints — never swap portrait/landscape on flip;
      // let the device choose the orientation naturally.
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.cameraMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace the published video track in LiveKit.
      // BUG-FIX-RECORDING: stopOnUnpublish=false — we DON'T want to stop
      // the old track here because MediaRecorder may still be using it.
      // The old track will be stopped below AFTER we swap it out of localStream.
      const localParticipant = this.room.localParticipant;
      const videoPublications = [...localParticipant.trackPublications.values()].filter(
        (pub) => pub.track?.kind === Track.Kind.Video
      );

      for (const pub of videoPublications) {
        if (pub.track) {
          await localParticipant.unpublishTrack(pub.track, false);
        }
      }

      await localParticipant.publishTrack(newVideoTrack, {
        name: 'camera',
        simulcast: true,
        videoResolution: VideoPresets.h720,
      });

      // BUG-FIX-PERM: Update localStream reference for recording.
      // DO NOT stop the old track here — the mediaStreamSingleton owns it.
      // Stopping it would invalidate the singleton cache and force a new
      // getUserMedia call (with iOS permission prompt) next time Go Live opens.
      // Instead just swap the track reference; the singleton will stop it
      // on full session teardown.
      if (this.localStream) {
        const oldVideo = this.localStream.getVideoTracks()[0];
        if (oldVideo) {
          this.localStream.removeTrack(oldVideo);
          // DO NOT call oldVideo.stop() — singleton owns lifecycle
        }
        this.localStream.addTrack(newVideoTrack);
      }

      return newStream;
    } catch (err) {
      logError('flipCamera', err);
      this.cameraMode = this.cameraMode === 'user' ? 'environment' : 'user'; // Revert
      throw err;
    }
  }

  /**
   * Bug20: Replace the outgoing video track with a new one (used for canvas beauty filter).
   * Identical pattern to flipCamera — unpublish current video track, publish replacement.
   * @param {MediaStreamTrack} newTrack - the new video track (e.g. from canvas.captureStream(30))
   */
  async replaceVideoTrack(newTrack) {
    if (!this.room?.localParticipant) return;
    const localParticipant = this.room.localParticipant;
    const videoPublications = [...localParticipant.trackPublications.values()].filter(
      (pub) => pub.track?.kind === Track.Kind.Video
    );
    for (const pub of videoPublications) {
      if (pub.track) {
        // BUG-FIX-RECORDING: pass stopOnUnpublish=false so LiveKit does NOT stop
        // the underlying MediaStreamTrack. The camera track is also what
        // MediaRecorder records from — stopping it kills recording after the
        // first second (beauty canvas kicks in ~1s after going live).
        await localParticipant.unpublishTrack(pub.track, false);
      }
    }
    await localParticipant.publishTrack(newTrack, {
      name: 'camera',
      simulcast: true,
      videoResolution: VideoPresets.h720,
    });
  }

  /**
   * Toggle microphone mute/unmute
   * @returns {boolean} new muted state
   */
  async toggleMute() {
    if (!this.room) throw new Error('No active room');
    const localParticipant = this.room.localParticipant;
    const audioPublications = [...localParticipant.trackPublications.values()].filter(
      (pub) => pub.track?.kind === Track.Kind.Audio
    );

    const currentlyMuted = audioPublications[0]?.isMuted ?? false;
    const newMuted = !currentlyMuted;

    for (const pub of audioPublications) {
      if (pub.track) {
        if (newMuted) {
          await pub.track.mute();
        } else {
          await pub.track.unmute();
        }
      }
    }

    // Also mute the local stream audio tracks (affects recording)
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !newMuted;
      });
    }

    return newMuted;
  }

  /**
   * End the current broadcast
   */
  async endBroadcast() {
    if (!this.currentStreamId) return;
    this.isManualDisconnect = true;

    // BUG FIX (#11, #13, #15): Fire-and-forget call to mark the live feed post as ended immediately.
    // During a beforeunload event (tab close), any `await` yields execution and the browser
    // destroys the execution context, meaning subsequent lines NEVER RUN. We MUST fire the
    // fetch with `keepalive: true` BEFORE the first `await`.
    const streamIdForEnd = this.currentStreamId;
    const token = getAccessToken();
    fetch('/api/live/end-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'same-origin',
      keepalive: true, // MANDATORY for requests fired during page teardown
      body: JSON.stringify({ stream_id: streamIdForEnd, action: 'force_end' }),
    }).catch(() => {}); // Non-fatal

    // RIGOR-AUDIT-2 LSS-7: do NOT write status/ended_at from the client.
    // The keepalive fetch above already triggers server-side
    // /api/live/end-stream?action=force_end which writes status='ended'
    // with server-clock now() — accurate regardless of the user's device
    // clock. Two writes racing also led to the duration computed from
    // (started_at, ended_at) becoming non-deterministic. Server wins.

    // Stop broadcaster keepalive heartbeat before disconnecting
    this._stopBroadcasterHeartbeat();

    // Disconnect LiveKit room (fire-and-forget)
    if (this.room) {
      this.room.disconnect().catch(() => {});
      this.room = null;
    }

    // Stop local tracks
    // BUG-FIX-LIVE-2 verification: previously this stopped both audio and
    // video tracks. But the MediaStream is owned by the caller (the
    // mediaStreamSingleton via GoLiveModal), not by LiveStreamService.
    // Stopping tracks here invalidates the singleton's cached stream, so
    // the next Go Live tap re-triggers iOS Safari's permission UI —
    // exactly the bug we're fixing. Just clear our reference; the
    // singleton manages track lifecycle and releases on full session end.
    if (this.localStream) {
      this.localStream = null;
    }

    // Clean up viewer subscription channel
    if (this._viewerChannel) {
      supabase.removeChannel(this._viewerChannel);
      this._viewerChannel = null;
    }
    // Clean up debounce timer
    if (this._viewerCountDebounceTimer) {
      clearTimeout(this._viewerCountDebounceTimer);
      this._viewerCountDebounceTimer = null;
    }
    console.debug('[LiveKit] Broadcast ended:', this.currentStreamId);
    const endedId = this.currentStreamId;
    this.currentStreamId = null;

    // BUG-FIX-LIVE-LIST-8a: clear persisted broadcast state — clean end
    // means there's nothing to resume from.
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('liveBroadcasterState');
      }
    } catch (_) {
      /* non-fatal */
    }

    this.isBroadcaster = false; // FIX: reset so next session isn't tainted
    this.currentUserId = null; // FIX: reset identity for next session
    this._remoteStreamDelivered = false; // FIX: reset guard for next session
    // BUG-FIX-AUDIT LSS-3: clear guestInviteCode so it never bleeds into a
    // subsequent joinStream() session — a stale code would be sent on reconnect
    // for a stream that has nothing to do with the original guest invite.
    this.guestInviteCode = null;
    return endedId;
  }

  // ═══════════════════════════════════════════════════
  // VIEWER
  // ═══════════════════════════════════════════════════

  /**
   * Join a live stream as a viewer
   */
  async joinStream(streamId, userId, onRemoteStream) {
    if (this.room && this.currentStreamId === streamId && this.room.state === 'connected') {
      this.onRemoteStream = onRemoteStream;
      if (this._remoteMediaStream && this._remoteMediaStream.getTracks().length > 0) {
        this.onRemoteStream?.(this._remoteMediaStream);
      }
      try {
        await supabase.rpc('update_live_peak_viewers', { p_stream_id: streamId, p_count: 1 });
      } catch (_) {}
      // BUG-FIX-DEEP-AUDIT-R3 L-3: ensure heartbeat is running on
      // fast-path rejoin too. Without this, a viewer who briefly
      // navigates away and back would have their heartbeat stopped
      // (via leaveStream) but never restarted because joinStream
      // returned early.
      if (userId) {
        this._startViewerHeartbeat(streamId);
      }
      const { data: stream } = await supabase
        .from('live_streams')
        // BUG-FIX-DEEP-AUDIT-R2 GUEST-1: enumerate safe columns;
        // guest_invite_code is no longer readable by end-user roles.
        .select(
          LIVE_STREAM_SAFE_COLS + ', broadcaster:profiles(id, username, full_name, avatar_url)'
        )
        .eq('id', streamId)
        .maybeSingle();
      return stream;
    }

    if (this.room) {
      await this.leaveStream();
    }

    this.currentStreamId = streamId;
    this.currentUserId = userId;
    this.isBroadcaster = false;
    this.onRemoteStream = onRemoteStream;
    this.isManualDisconnect = false;

    // Fetch stream
    const { data: stream, error } = await supabase
      .from('live_streams')
      // BUG-FIX-DEEP-AUDIT-R2 GUEST-1: safe-cols enumeration.
      .select(LIVE_STREAM_SAFE_COLS + ', broadcaster:profiles(id, username, full_name, avatar_url)')
      .eq('id', streamId)
      .maybeSingle();

    if (error || !stream) throw new Error('Stream not found');
    if (stream.status !== 'live') throw new Error('Stream has ended');

    // Register viewer — onConflict MUST target the composite unique (stream_id, viewer_id).
    // Without it, Supabase falls back to the PK, so reconnects/StrictMode double-fires
    // created duplicate rows that permanently inflated viewer counts after leaveStream().
    //
    // BUG-FIX-DEEP-AUDIT-R3 L-3: use the heartbeat RPC instead of a
    // direct upsert. The RPC sets last_seen_at=now() on both insert
    // and conflict-update, which the fn_cleanup_stale_viewers cron
    // uses to prune ghost viewers. Falls back to the direct upsert
    // if the RPC is missing (dev environment with stale migrations).
    if (userId) {
      const { error: hbErr } = await supabase.rpc('fn_heartbeat_live_viewer', {
        p_stream_id: streamId,
      });
      if (hbErr && (hbErr.code === 'PGRST202' || hbErr.message?.includes('not exist'))) {
        // Pre-migration fallback. Production has the RPC; this
        // branch only fires in older dev DBs.
        const { error: err_live_viewers_7smci } = await supabase
          .from('live_viewers')
          .upsert(
            { stream_id: streamId, viewer_id: userId },
            { onConflict: 'stream_id,viewer_id' }
          );
        if (err_live_viewers_7smci) console.warn('[Supabase] Silent mutation failed in live_viewers:', err_live_viewers_7smci.message);
      }
    }

    // BUG-FIX-DEEP-AUDIT-R3 L-3: start the periodic heartbeat. Refreshes
    // last_seen_at every 30 seconds while this viewer is connected. The
    // server-side cleanup cron prunes viewers older than 5 minutes, so
    // a 30s heartbeat gives ~10 missed heartbeats of headroom for a
    // single viewer (cellular dropouts, brief tab background, etc.).
    // Cleared on leaveStream() via _stopViewerHeartbeat.
    if (userId) {
      this._startViewerHeartbeat(streamId);
    }

    // Update peak_viewers if needed — wrapped in try/catch because supabase.rpc()
    // returns a thenable without .catch() on some iOS Safari builds
    try {
      await supabase.rpc('update_live_peak_viewers', { p_stream_id: streamId, p_count: 1 });
    } catch (_) {}

    // Get token and connect
    const { token, url } = await this._getToken(streamId, false);
    await this._connectRoom(url, token, false, null);

    // Handle already-published tracks that fired before TrackSubscribed listener
    let remoteStreamDelivered = false;
    // FIX (LSV-7): Reset _remoteMediaStream at joinStream start. Without this, rapid
    // join→leave→join cycles accumulate stale tracks from the previous session,
    // causing black video (wrong track) or audio from a previous stream.
    this._remoteMediaStream = new MediaStream();
    for (const [, participant] of this.room.remoteParticipants) {
      for (const [, publication] of participant.trackPublications) {
        if (publication.isSubscribed && publication.track) {
          if (publication.track.mediaStreamTrack) {
            this._remoteMediaStream.addTrack(publication.track.mediaStreamTrack);
          }
          // Attach pre-existing audio tracks
          if (publication.track.kind === Track.Kind.Audio) {
            try {
              const audioEl = publication.track.attach();
              audioEl.id = `livekit-audio-${participant.sid}`;
              audioEl.style.display = 'none';
              document.body.appendChild(audioEl);
            } catch (_) {}
          }
        }
      }
    }
    if (this._remoteMediaStream.getTracks().length > 0) {
      remoteStreamDelivered = true;
      onRemoteStream?.(this._remoteMediaStream);
    }
    // FIX: store a flag so TrackSubscribed handler won't double-fire if loop already delivered
    this._remoteStreamDelivered = remoteStreamDelivered;
    this.onParticipantsUpdate?.(Array.from(this.room.remoteParticipants.values()));

    // Subscribe to viewer count
    this._subscribeToViewers(streamId);

    console.debug('📺 Joined stream:', streamId);
    return stream;
  }

  /**
   * Leave the current stream
   */
  async leaveStream() {
    // BUG FIX (S1): only gate on currentStreamId. Previously also gated on
    // currentUserId which we reset to null on first call — causing a second
    // leaveStream() call (React StrictMode double-effect, nav) to exit early
    // without deleting the live_viewers row, permanently inflating viewer counts.
    if (!this.currentStreamId) return;
    this.isManualDisconnect = true;
    // Capture before nulling
    const leavingStreamId = this.currentStreamId;
    const leavingUserId = this.currentUserId;

    // BUG-FIX-DEEP-AUDIT-R3 L-3: stop the viewer heartbeat. The direct
    // delete + keepalive leave-stream below removes the row; once the
    // row is gone, heartbeats would just re-insert it.
    this._stopViewerHeartbeat();

    if (leavingUserId) {
      // BUG FIX (S2): Fire-and-forget call with keepalive to ensure viewer removal.
      // During a beforeunload event (tab close), any `await` yields execution and the browser
      // destroys the execution context, meaning subsequent lines NEVER RUN. We MUST fire the
      // fetch with `keepalive: true` to prevent ghost viewers.
      const token = getAccessToken();
      fetch('/api/live/leave-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        keepalive: true, // MANDATORY for requests fired during page teardown
        body: JSON.stringify({ stream_id: leavingStreamId }),
      }).catch(() => {});

      // Still do the direct update if we are not unloading
      supabase
        .from('live_viewers')
        .delete()
        .eq('stream_id', leavingStreamId)
        .eq('viewer_id', leavingUserId)
        .catch(() => {});
    }

    if (this.room) {
      this.room.disconnect().catch(() => {});
      this.room = null;
    }

    // Clean up viewer subscription channel
    if (this._viewerChannel) {
      supabase.removeChannel(this._viewerChannel);
      this._viewerChannel = null;
    }
    // Clean up debounce timer (only fires for broadcaster now; safe to cancel for viewers too)
    if (this._viewerCountDebounceTimer) {
      clearTimeout(this._viewerCountDebounceTimer);
      this._viewerCountDebounceTimer = null;
    }
    // Reset remote stream guard for next join
    this._remoteStreamDelivered = false;
    this._remoteMediaStream = null;
    // Clean up any LiveKit audio elements attached to body
    document.querySelectorAll('[id^="livekit-audio-"]').forEach((el) => el.remove());
    console.debug('[LiveKit] Left stream:', leavingStreamId);
    // FIX: reset ALL identity fields so the singleton is clean for the next
    // joinStream() call (prevents multi-tab/multi-session state leakage).
    // Previously only endBroadcast() reset currentUserId — leaveStream() did not,
    // allowing the viewer identity to bleed into subsequent sessions.
    this.currentStreamId = null;
    this.currentUserId = null; // FIX: was never reset in leaveStream()
    this.isManualDisconnect = false; // FIX: reset so next join can reconnect on disconnect
    // BUG-FIX-AUDIT LSS-3: clear guestInviteCode so it never bleeds into a
    // subsequent joinStream() — a stale invite code would cause _handleUnexpectedDisconnect
    // to send broadcaster=false + a wrong invite code to the token API for the new stream.
    this.guestInviteCode = null;
  }

  // ═══════════════════════════════════════════════════
  // MODERATION
  // ═══════════════════════════════════════════════════

  /**
   * Toggle slow mode for a stream.
   *
   * STREAM-POLISH-R3 CHAT-MOD-3: optional `delay` parameter (seconds)
   * lets the broadcaster tune the throttle between 1s and 120s. The
   * column was added in migration 20260511200000_live_streams_slow_mode_delay_column.
   * If omitted, only the boolean toggles — the column default (3) or
   * the previously-set value persists.
   *
   * @param {string} streamId
   * @param {boolean} enabled
   * @param {number} [delay] seconds, integer, 1..120
   */
  async setSlowMode(streamId, enabled, delay) {
    const payload = { slow_mode: enabled };
    if (typeof delay === 'number' && Number.isFinite(delay)) {
      const clamped = Math.max(1, Math.min(120, Math.round(delay)));
      payload.slow_mode_delay = clamped;
    }
    const { error } = await supabase.from('live_streams').update(payload).eq('id', streamId);
    if (error) throw new Error(`setSlowMode failed: ${error.message}`);
  }

  /**
   * Ban a user from commenting — uses server-side API (service role) to avoid
   * RLS issues and to ensure the broadcaster identity is resolved server-side.
   *
   * Ban is broadcaster-only on the server; co-hosts cannot ban.
   */
  async banUser(streamId, bannedUserId) {
    try {
      const token = getAccessToken();
      const resp = await fetch('/api/live/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'ban_user',
          stream_id: streamId,
          target_user_id: bannedUserId,
        }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `Ban failed (${resp.status})`);
      }
    } catch (err) {
      logError('banUser', err);
    }
  }

  /**
   * Delete a comment — must use server-side API (anon key can't delete
   * comments written by other users even as broadcaster; RLS blocks it).
   * Broadcasters can delete any comment in their own stream via the API.
   *
   * BUG-FIX-DEEP-AUDIT-R3 M-9: optional `guestInviteCode` arg lets a
   * verified co-host call this too. The server verifies the code against
   * live_streams.guest_invite_code.
   */
  async deleteComment(commentId, guestInviteCode = null) {
    try {
      const token = getAccessToken();
      const body = {
        action: 'delete_comment',
        comment_id: commentId,
        stream_id: this.currentStreamId,
      };
      if (guestInviteCode) body.guest_invite_code = guestInviteCode;
      const resp = await fetch('/api/live/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `Delete failed (${resp.status})`);
      }
    } catch (err) {
      logError('deleteComment', err);
    }
  }

  /**
   * Pin a comment (replaces existing pin for the stream)
   *
   * BUG-FIX-DEEP-AUDIT-R3 M-9: optional `guestInviteCode` for co-host.
   */
  async pinComment(streamId, commentId, guestInviteCode = null) {
    try {
      const token = getAccessToken();
      const body = { action: 'pin_comment', stream_id: streamId, comment_id: commentId };
      if (guestInviteCode) body.guest_invite_code = guestInviteCode;
      const resp = await fetch('/api/live/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `Pin failed (${resp.status})`);
      }
    } catch (err) {
      logError('pinComment', err);
    }
  }

  /**
   * Unpin the current comment for the stream
   *
   * BUG-FIX-DEEP-AUDIT-R3 M-9: optional `guestInviteCode` for co-host.
   */
  async unpinComment(streamId, guestInviteCode = null) {
    try {
      const token = getAccessToken();
      const body = { action: 'unpin_comment', stream_id: streamId };
      if (guestInviteCode) body.guest_invite_code = guestInviteCode;
      const resp = await fetch('/api/live/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `Unpin failed (${resp.status})`);
      }
    } catch (err) {
      logError('unpinComment', err);
    }
  }

  // ═══════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════

  _trackToStream(track) {
    try {
      if (!track?.mediaStreamTrack) return null;
      return new MediaStream([track.mediaStreamTrack]);
    } catch {
      return null;
    }
  }

  _getParticipants() {
    if (!this.room) return [];
    return [...this.room.remoteParticipants.values()].map((p) => ({
      identity: p.identity,
      name: p.name,
      sid: p.sid,
    }));
  }

  /**
   * BUG-FIX-DEEP-AUDIT-R3 L-3: viewer heartbeat. Refreshes the
   * (stream_id, viewer_id, last_seen_at) row every 30 seconds while the
   * viewer is connected. The server-side fn_cleanup_stale_viewers cron
   * deletes rows older than 5 minutes, so a 30s heartbeat gives ~10
   * missed heartbeats before this viewer is pruned — comfortable for
   * cellular dropouts, brief tab background, etc.
   *
   * Anon viewers don't heartbeat (no profile FK; they're tracked via
   * the LiveKit participant count, which IS authoritative for
   * viewer_count).
   */
  _startViewerHeartbeat(streamId) {
    this._stopViewerHeartbeat(); // idempotent: replace any prior timer
    this._viewerHeartbeatStreamId = streamId;
    this._viewerHeartbeatTimer = setInterval(() => {
      if (this._viewerHeartbeatStreamId !== streamId) return;
      supabase
        .rpc('fn_heartbeat_live_viewer', { p_stream_id: streamId })
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        })
        .catch((err) => {
          // Non-fatal — next tick retries. If the RPC vanishes
          // (DB rollback), the user is still in the room, they
          // just risk being pruned by the 5-min cleanup.
          console.warn('[LiveStream] viewer heartbeat:', err?.message || err);
        });
    }, 30_000);
  }

  _stopViewerHeartbeat() {
    if (this._viewerHeartbeatTimer) {
      clearInterval(this._viewerHeartbeatTimer);
      this._viewerHeartbeatTimer = null;
    }
    this._viewerHeartbeatStreamId = null;
  }

  /**
   * HARDENING: Broadcaster keepalive — independent of StreamPreviewCapture.
   *
   * StreamPreviewCapture (MediaRecorder + canvas) can be throttled or fully
   * paused by the browser when the tab is backgrounded. A broadcaster whose
   * tab is in the background is still live via LiveKit; only the local clip
   * recording pauses. Without this heartbeat the stale-cleanup cron would
   * see preview_updated_at stop refreshing and terminate an active stream
   * well before the 300-second mandate.
   *
   * This timer fires every 60 seconds and POSTs to /api/live/heartbeat which
   * does a server-side UPDATE of preview_updated_at (service role, bypasses
   * RLS column restrictions). The 300s cleanup threshold gives 5× the ping
   * interval as safety margin — even if 4 consecutive pings fail, the stream
   * survives until the 5th fires.
   *
   * Called from startBroadcast() after the LiveKit room is connected.
   * Stopped in endBroadcast() on clean teardown.
   */
  _startBroadcasterHeartbeat(streamId) {
    this._stopBroadcasterHeartbeat(); // idempotent: replace any prior timer
    this._broadcasterHeartbeatStreamId = streamId;
    // Ping immediately so preview_updated_at is fresh on stream start, then
    // every 60 seconds thereafter. Failures are non-fatal — the stream
    // survives as long as any heartbeat lands within the 300s window.
    const ping = async () => {
      if (this._broadcasterHeartbeatStreamId !== streamId) return;

      let token = null;
      try {
        token =
          typeof getFreshAccessToken === 'function'
            ? await getFreshAccessToken()
            : getAccessToken();
      } catch (err) {
        token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      }

      fetch('/api/live/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        keepalive: true, // survives tab navigation / beforeunload
        body: JSON.stringify({ stream_id: streamId }),
      }).catch((err) => {
        // Non-fatal — next tick retries. 300s window allows up to 4 consecutive misses.
        console.warn('[LiveStream] broadcaster heartbeat failed:', err?.message || err);
      });
    };
    ping(); // immediate first ping on stream start
    // BUG-FIX-STREAM-KILL: increased from 60s to 30s. With the 300s stale
    // threshold, this gives 10× headroom (10 missed heartbeats before kill)
    // instead of 5×, making mid-stream kills from transient network issues
    // much less likely. Dan reported a stream killed at ~8 minutes.
    this._broadcasterHeartbeatTimer = setInterval(ping, 30_000);
  }

  _stopBroadcasterHeartbeat() {
    if (this._broadcasterHeartbeatTimer) {
      clearInterval(this._broadcasterHeartbeatTimer);
      this._broadcasterHeartbeatTimer = null;
    }
    this._broadcasterHeartbeatStreamId = null;
  }

  /**
   * BUG-FIX-LIVE-6 + STREAM-POLISH-R2 VIEWER-1: count remote
   * participants who are real viewers.
   *
   * BUG-FIX-LIVE-6: exclude short-lived "preview-*" identities issued
   * by /api/live/preview-token (LiveStreamCard's hover/inline preview)
   * so the broadcaster's own social-feed tile peeking at the stream
   * doesn't count as +1 viewer.
   *
   * STREAM-POLISH-R2 VIEWER-1: also exclude the broadcaster's own
   * identities. The Bug 5 fix (PR #395) introduced per-device viewer
   * identities `<user_id>:vw-<random>`. If the broadcaster opens their
   * own live stream from a second device (or taps into a story preview
   * that mounts LiveStreamViewer for their own stream), the 2nd device
   * joins as a remote participant with identity
   * `<broadcaster_id>:vw-<random>`. Without this filter the broadcaster
   * sees a phantom "+1 viewer" that's really just themselves — the
   * same off-by-one Dan reported, returning via the new multi-device
   * path.
   *
   * Filter rule: skip any participant whose identity is exactly the
   * broadcaster's user_id OR starts with `<broadcaster_id>:vw-`.
   */
  _countRealViewers() {
    if (!this.room) return 0;
    const bid = this.currentUserId ? String(this.currentUserId) : null;
    const bidViewerPrefix = bid ? `${bid}:vw-` : null;
    let n = 0;
    for (const p of this.room.remoteParticipants.values()) {
      const id = p.identity || '';
      if (id.startsWith('preview-')) continue;
      // STREAM-POLISH-R2 VIEWER-1: skip broadcaster's own devices.
      if (bid && (id === bid || (bidViewerPrefix && id.startsWith(bidViewerPrefix)))) continue;
      n++;
    }
    return n;
  }

  /** Debounce viewer count updates — prevents write storms with 100+ viewers */
  _debouncedUpdateViewerCount() {
    if (!this.isBroadcaster) return; // FIX: Only the broadcaster tracks and updates the true viewer count
    if (this._viewerCountDebounceTimer) clearTimeout(this._viewerCountDebounceTimer);
    // Immediately update the local callback for instant UI (filtered count)
    this.onViewerCountChange?.(this._countRealViewers());
    // Debounce the DB write to once per 5 seconds
    this._viewerCountDebounceTimer = setTimeout(() => this._updateViewerCount(), 5000);
  }

  async _updateViewerCount() {
    if (!this.currentStreamId || !this.room) return;
    const count = this._countRealViewers();

    // BUG-FIX-LIVE-AUDIT: viewer_count + peak_viewers UPDATE goes through
    // a single SECURITY DEFINER RPC. Direct UPDATEs on these columns are
    // now blocked by trg_live_streams_guard_update (clout-fraud guard) —
    // the RPC bypasses the trigger via SECURITY DEFINER and atomically
    // updates both fields in one statement.
    try {
      const { error: rpcErr } = await supabase.rpc('update_live_metrics', {
        p_stream_id: this.currentStreamId,
        p_viewer_count: count,
      });
      if (rpcErr) throw new Error(rpcErr.message);
    } catch (err) {
      // Non-fatal — the next debounce tick will retry. We never fall
      // through to a direct UPDATE here because the trigger would
      // reject it (correctly).
      console.warn('[LiveStreamService] update_live_metrics failed:', err?.message || err);
    }
    this.onViewerCountChange?.(count);
  }

  _subscribeToViewers(streamId) {
    // FIX (S5): Use role-specific channel name to prevent broadcaster and
    // viewer singleton channels from colliding when both are on same device.
    // Without this, a viewer joining overwrites the broadcaster's _viewerChannel
    // ref, then their leaveStream() removes the broadcaster's subscription.
    // RIGOR-AUDIT-2 LSS-2: also append a per-mount unique suffix so two
    // tabs of the same role (e.g. broadcaster on 2 devices, or viewer
    // on 2 tabs) don't collide — Realtime silently drops payloads on
    // the duplicate channel name.
    const roleSuffix = this.isBroadcaster ? 'bc' : 'vw';
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (this._viewerChannel) {
      supabase.removeChannel(this._viewerChannel);
    }
    this._viewerChannel = supabase
      .channel(`live-viewers-${streamId}-${roleSuffix}-${uniq}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_streams',
          filter: `id=eq.${streamId}`,
        },
        (payload) => {
          if (payload.new) {
            this.onViewerCountChange?.(payload.new.viewer_count);
            if (payload.new.status === 'ended' && !this.isBroadcaster) {
              if (this.onStreamEnded) {
                this.onStreamEnded();
              } else {
                this.leaveStream();
              }
            }
            // Bug25: notify broadcaster when stream is externally ended (lost connection / power / closed app)
            if (payload.new.status === 'ended' && this.isBroadcaster) {
              this.onStreamEndedExternally?.();
            }
          }
        }
      )
      .subscribe();
  }

  async _notifyFollowers(userId, title, streamId) {
    try {
      const token = getAccessToken();
      await fetch('/api/notifications/live-notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ streamId, title }),
        credentials: 'same-origin',
      });
    } catch (err) {
      logError('notifyFollowers', err);
    }
  }

  async _createLiveFeedPost(streamId, title) {
    try {
      const token = getAccessToken();
      const res = await fetch('/api/live/create-live-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ stream_id: streamId, title }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (data.success && data.postId) {
        // BUG FIX: Emit event so the broadcaster's own feed updates instantly
        busEmit.socialPostCreated?.(data.postId, this.currentUserId);
      }
    } catch (err) {
      logError('createLiveFeedPost', err);
    }
  }

  // ═══════════════════════════════════════════════════
  // FEATURE 4: ADAPTIVE BITRATE (ABR) QUALITY CONTROL
  // ═══════════════════════════════════════════════════

  /**
   * Set viewer preferred video quality tier.
   * LiveKit ABR adapts automatically; this allows viewers to override
   * to a lower tier to conserve bandwidth on cellular connections.
   * @param {'auto'|'high'|'medium'|'low'} quality
   */
  setVideoQuality(quality) {
    if (!this.room) {
      console.warn('[LiveKit] setVideoQuality called with no active room');
      return;
    }
    this._preferredQuality = quality;

    // Map named tiers to LiveKit VideoQuality enum values where available
    try {
      // LiveKit client exposes VideoQuality on the room's remote participants
      // We iterate all subscribed video tracks and call setVideoQuality
      for (const [, participant] of this.room.remoteParticipants) {
        for (const [, publication] of participant.trackPublications) {
          if (publication.kind === 'video' && publication.isSubscribed && publication.track) {
            // VideoQuality: LOW=0, MEDIUM=1, HIGH=2, OFF=3
            const qualityMap = { auto: undefined, high: 2, medium: 1, low: 0 };
            const qValue = qualityMap[quality];
            if (qValue !== undefined && publication.setVideoQuality) {
              publication.setVideoQuality(qValue);
            }
          }
        }
      }
      console.debug(`[LiveKit] Video quality set to: ${quality}`);
    } catch (err) {
      // Non-fatal — ABR will still adapt automatically
      console.warn('[LiveKit] setVideoQuality error:', err?.message || err);
    }
  }

  // ═══════════════════════════════════════════════════
  // STATIC
  // ═══════════════════════════════════════════════════

  static async getLiveStreams() {
    // BUG-FIX-LIVE-AUDIT (B3): use the get_visible_live_streams RPC which
    // filters out streams from broadcasters the caller has blocked OR
    // who have blocked the caller. The previous direct SELECT returned
    // every live stream regardless of mutual blocks.
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_visible_live_streams');

    if (!rpcErr && rpcData) {
      // Reshape RPC rows to the same shape the rest of the app expects:
      // { ...stream_columns, broadcaster: { id, username, full_name, avatar_url } }
      return rpcData.map((r) => ({
        id: r.id,
        broadcaster_id: r.broadcaster_id,
        title: r.title,
        description: r.description,
        thumbnail_url: r.thumbnail_url,
        preview_clip_url: r.preview_clip_url,
        preview_updated_at: r.preview_updated_at,
        status: r.status,
        viewer_count: r.viewer_count,
        peak_viewers: r.peak_viewers,
        reaction_count: r.reaction_count,
        category: r.category,
        started_at: r.started_at,
        livekit_room: r.livekit_room,
        broadcaster: {
          id: r.broadcaster_id,
          username: r.broadcaster_username,
          full_name: r.broadcaster_full_name,
          avatar_url: r.broadcaster_avatar,
        },
      }));
    }

    // Fallback: RPC missing (older dev DB) — direct SELECT, NO block filter.
    // Production has the RPC; this branch only fires in mismatched envs.
    if (rpcErr && (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('not exist'))) {
      console.warn(
        '[LiveStreamService] get_visible_live_streams RPC missing — falling back to unfiltered SELECT'
      );
      const { data, error } = await supabase
        .from('live_streams')
        // BUG-FIX-DEEP-AUDIT-R2 GUEST-1: safe-cols enumeration.
        .select(
          LIVE_STREAM_SAFE_COLS + ', broadcaster:profiles(id, username, full_name, avatar_url)'
        )
        .eq('status', 'live')
        .order('started_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    if (rpcErr) throw rpcErr;
    return [];
  }

  static async getStream(streamId) {
    const { data, error } = await supabase
      .from('live_streams')
      // BUG-FIX-DEEP-AUDIT-R2 GUEST-1: safe-cols enumeration.
      .select(LIVE_STREAM_SAFE_COLS + ', broadcaster:profiles(id, username, full_name, avatar_url)')
      .eq('id', streamId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  static async getStreamAnalytics(streamId) {
    const { data } = await supabase
      .from('live_stream_analytics')
      .select('*')
      .eq('id', streamId)
      .maybeSingle();
    return data || null;
  }
}

// Singleton
export const liveStreamService = new LiveStreamService();
export default LiveStreamService;
