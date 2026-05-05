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
import { getAccessToken } from '../lib/authUtils';
import { busEmit } from '../engine/EventBus';

const logError = (ctx, err) => console.warn(`[LiveStream:${ctx}]`, err?.message || err);

// Reconnect settings
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

/**
 * LiveStreamService v2 — LiveKit SFU
 */
class LiveStreamService {
    constructor() {
        this.room = null;
        this.localStream = null;       // Raw MediaStream (for recording)
        this.currentStreamId = null;
        this.currentUserId = null;
        this.cameraMode = 'user';      // 'user' (front) | 'environment' (back)
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
        this.onConnectionQualityChange = null;
        this.onGiftReceived = null;
        this._viewerCountDebounceTimer = null;
        // NOTE: _giftChannel is intentionally absent — gift broadcast channels are
        // managed by React component refs (GoLiveModal / LiveStreamViewer) to tie
        // their lifecycle to the component, not the singleton service.
    }

    // ═══════════════════════════════════════════════════
    // TOKEN
    // ═══════════════════════════════════════════════════

    async _getToken(streamId, broadcaster, guestInviteCode = null) {
        const token = getAccessToken();
        const resp = await fetch('/api/live/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                room: streamId,
                identity: this.currentUserId,
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
            status: 'live',
            category: category || 'general',
        };
        if (thumbnailUrl) insertPayload.thumbnail_url = thumbnailUrl;
        if (description) insertPayload.description = description;

        const { data: stream, error } = await supabase
            .from('live_streams')
            .insert(insertPayload)
            .select()
            .maybeSingle();

        if (error || !stream) throw new Error(`Failed to create stream: ${error?.message}`);

        this.currentStreamId = stream.id;

        // 2. Update record with LiveKit room name (= stream id)
        await supabase.from('live_streams')
            .update({ livekit_room: stream.id })
            .eq('id', stream.id);

        // 3. Get LiveKit token and connect
        const { token, url } = await this._getToken(stream.id, true);
        await this._connectRoom(url, token, true, mediaStream);

        // 4. Subscribe to viewer count changes
        this._subscribeToViewers(stream.id);

        // 5. Notify followers
        this._notifyFollowers(userId, title || 'Live Stream', stream.id);

        // 6. Create feed post so the live stream appears in the news feed
        this._createLiveFeedPost(stream.id, title || 'Live Stream');

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
        const { token, url } = await this._getToken(streamId, true, guestInviteCode);
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
            dynacast: true,             // Automatically adjust quality
            publishDefaults: {
                simulcast: true,        // Feature 4: Enable simulcast for manual resolution control
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
                    els.forEach(el => el.remove());
                } catch (_) {}
            }
        });

        await this.room.connect(url, token, {
            autoSubscribe: !isBroadcaster,
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
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;
        this.onReconnecting?.();

        console.debug(`[LiveKit] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);

        await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS * this.reconnectAttempts));

        try {
            const { token, url } = await this._getToken(this.currentStreamId, this.isBroadcaster, this.guestInviteCode);
            // FIX: disconnect the old Room before creating a new one to prevent room leak
            if (this.room) {
                try { await this.room.disconnect(); } catch (_) {}
                this.room = null;
            }
            // FIX: reset stream guard so TrackSubscribed can deliver the new remote stream
            this._remoteStreamDelivered = false;
            // FIX: clean up stale audio elements and old remote stream from the previous session
            // to prevent track accumulation across reconnect cycles.
            document.querySelectorAll('[id^="livekit-audio-"]').forEach(el => el.remove());
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
     * Flip camera between front and back
     */
    async flipCamera() {
        if (!this.room || !this.isBroadcaster) return;

        this.cameraMode = this.cameraMode === 'user' ? 'environment' : 'user';

        try {
            // Get new stream with opposite camera
            const isMobile = window.innerWidth < 768;
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.cameraMode, width: { ideal: isMobile ? 720 : 1280 }, height: { ideal: isMobile ? 1280 : 720 } },
                audio: false,
            });

            const newVideoTrack = newStream.getVideoTracks()[0];

            // Replace the published video track in LiveKit
            const localParticipant = this.room.localParticipant;
            const videoPublications = [...localParticipant.trackPublications.values()]
                .filter(pub => pub.track?.kind === Track.Kind.Video);

            for (const pub of videoPublications) {
                if (pub.track) {
                    await localParticipant.unpublishTrack(pub.track);
                }
            }

            await localParticipant.publishTrack(newVideoTrack, {
                name: 'camera',
                simulcast: true,
                videoResolution: VideoPresets.h720,
            });

            // Update local stream reference for recording
            if (this.localStream) {
                const oldVideo = this.localStream.getVideoTracks()[0];
                if (oldVideo) {
                    this.localStream.removeTrack(oldVideo);
                    oldVideo.stop();
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
     * Toggle microphone mute/unmute
     * @returns {boolean} new muted state
     */
    async toggleMute() {
        if (!this.room) throw new Error('No active room');
        const localParticipant = this.room.localParticipant;
        const audioPublications = [...localParticipant.trackPublications.values()]
            .filter(pub => pub.track?.kind === Track.Kind.Audio);

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
            this.localStream.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
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

        // Update Supabase stream status (this will likely be cancelled by the browser if during beforeunload)
        await supabase
            .from('live_streams')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', this.currentStreamId).catch(() => {});

        // Disconnect LiveKit room
        if (this.room) {
            await this.room.disconnect();
            this.room = null;
        }

        // Stop local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
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
        this.isBroadcaster = false;   // FIX: reset so next session isn't tainted
        this.currentUserId = null;    // FIX: reset identity for next session
        this._remoteStreamDelivered = false; // FIX: reset guard for next session
        return endedId;
    }

    // ═══════════════════════════════════════════════════
    // VIEWER
    // ═══════════════════════════════════════════════════

    /**
     * Join a live stream as a viewer
     */
    async joinStream(streamId, userId, onRemoteStream) {
        this.currentStreamId = streamId;
        this.currentUserId = userId;
        this.isBroadcaster = false;
        this.onRemoteStream = onRemoteStream;
        this.isManualDisconnect = false;

        // Fetch stream
        const { data: stream, error } = await supabase
            .from('live_streams')
            .select('*, broadcaster:profiles(id, username, full_name, avatar_url)')
            .eq('id', streamId)
            .maybeSingle();

        if (error || !stream) throw new Error('Stream not found');
        if (stream.status !== 'live') throw new Error('Stream has ended');

        // Register viewer — onConflict MUST target the composite unique (stream_id, viewer_id).
        // Without it, Supabase falls back to the PK, so reconnects/StrictMode double-fires
        // created duplicate rows that permanently inflated viewer counts after leaveStream().
        if (userId) {
            await supabase.from('live_viewers').upsert(
                { stream_id: streamId, viewer_id: userId },
                { onConflict: 'stream_id,viewer_id' }
            );
        }

        // Update peak_viewers if needed — wrapped in try/catch because supabase.rpc()
        // returns a thenable without .catch() on some iOS Safari builds
        try { await supabase.rpc('update_live_peak_viewers', { p_stream_id: streamId, p_count: 1 }); } catch (_) {}

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

        if (leavingUserId) {
            await supabase.from('live_viewers')
                .delete()
                .eq('stream_id', leavingStreamId)
                .eq('viewer_id', leavingUserId);
        }

        if (this.room) {
            await this.room.disconnect();
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
        document.querySelectorAll('[id^="livekit-audio-"]').forEach(el => el.remove());
        console.debug('[LiveKit] Left stream:', leavingStreamId);
        // FIX: reset ALL identity fields so the singleton is clean for the next
        // joinStream() call (prevents multi-tab/multi-session state leakage).
        // Previously only endBroadcast() reset currentUserId — leaveStream() did not,
        // allowing the viewer identity to bleed into subsequent sessions.
        this.currentStreamId = null;
        this.currentUserId = null;      // FIX: was never reset in leaveStream()
        this.isManualDisconnect = false; // FIX: reset so next join can reconnect on disconnect
    }

    // ═══════════════════════════════════════════════════
    // MODERATION
    // ═══════════════════════════════════════════════════

    /**
     * Toggle slow mode for a stream
     */
    async setSlowMode(streamId, enabled) {
        await supabase.from('live_streams')
            .update({ slow_mode: enabled })
            .eq('id', streamId);
    }

    /**
     * Ban a user from commenting — uses server-side API (service role) to avoid
     * RLS issues and to ensure the broadcaster identity is resolved server-side.
     */
    async banUser(streamId, bannedUserId) {
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/live/moderate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'ban_user', stream_id: streamId, target_user_id: bannedUserId }),
            });
            if (!resp.ok) {
                const d = await resp.json().catch(() => ({}));
                throw new Error(d.error || `Ban failed (${resp.status})`);
            }
        } catch (err) { logError('banUser', err); }
    }

    /**
     * Delete a comment — must use server-side API (anon key can't delete
     * comments written by other users even as broadcaster; RLS blocks it).
     * Broadcasters can delete any comment in their own stream via the API.
     */
    async deleteComment(commentId) {
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/live/moderate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'delete_comment', comment_id: commentId, stream_id: this.currentStreamId }),
            });
            if (!resp.ok) {
                const d = await resp.json().catch(() => ({}));
                throw new Error(d.error || `Delete failed (${resp.status})`);
            }
        } catch (err) { logError('deleteComment', err); }
    }

    /**
     * Pin a comment (replaces existing pin for the stream)
     */
    async pinComment(streamId, commentId) {
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/live/moderate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'pin_comment', stream_id: streamId, comment_id: commentId }),
            });
            if (!resp.ok) {
                const d = await resp.json().catch(() => ({}));
                throw new Error(d.error || `Pin failed (${resp.status})`);
            }
        } catch (err) { logError('pinComment', err); }
    }

    /**
     * Unpin the current comment for the stream
     */
    async unpinComment(streamId) {
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/live/moderate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'unpin_comment', stream_id: streamId }),
            });
            if (!resp.ok) {
                const d = await resp.json().catch(() => ({}));
                throw new Error(d.error || `Unpin failed (${resp.status})`);
            }
        } catch (err) { logError('unpinComment', err); }
    }

    // ═══════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════

    _trackToStream(track) {
        try {
            if (!track?.mediaStreamTrack) return null;
            return new MediaStream([track.mediaStreamTrack]);
        } catch { return null; }
    }

    _getParticipants() {
        if (!this.room) return [];
        return [...this.room.remoteParticipants.values()].map(p => ({
            identity: p.identity,
            name: p.name,
            sid: p.sid,
        }));
    }

    /** Debounce viewer count updates — prevents write storms with 100+ viewers */
    _debouncedUpdateViewerCount() {
        if (!this.isBroadcaster) return; // FIX: Only the broadcaster tracks and updates the true viewer count
        if (this._viewerCountDebounceTimer) clearTimeout(this._viewerCountDebounceTimer);
        // Immediately update the local callback for instant UI
        if (this.room) this.onViewerCountChange?.(this.room.remoteParticipants.size);
        // Debounce the DB write to once per 5 seconds
        this._viewerCountDebounceTimer = setTimeout(() => this._updateViewerCount(), 5000);
    }

    async _updateViewerCount() {
        if (!this.currentStreamId || !this.room) return;
        const count = this.room.remoteParticipants.size;
        await supabase.from('live_streams')
            .update({ viewer_count: count })
            .eq('id', this.currentStreamId);

        try {
            await supabase.rpc('update_live_peak_viewers', {
                p_stream_id: this.currentStreamId,
                p_count: count,
            });
        } catch (_) {
            // Fallback: direct update if RPC doesn't exist
            try {
                await supabase.from('live_streams')
                    .update({ peak_viewers: count })
                    .eq('id', this.currentStreamId)
                    .lt('peak_viewers', count);
            } catch (_2) {}
        }
        this.onViewerCountChange?.(count);
    }

    _subscribeToViewers(streamId) {
        // FIX (S5): Use role-specific channel name to prevent broadcaster and
        // viewer singleton channels from colliding when both are on same device.
        // Without this, a viewer joining overwrites the broadcaster's _viewerChannel
        // ref, then their leaveStream() removes the broadcaster's subscription.
        const roleSuffix = this.isBroadcaster ? 'bc' : 'vw';
        if (this._viewerChannel) {
            supabase.removeChannel(this._viewerChannel);
        }
        this._viewerChannel = supabase
            .channel(`live-viewers-${streamId}-${roleSuffix}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'live_streams',
                filter: `id=eq.${streamId}`,
            }, (payload) => {
                if (payload.new) {
                    this.onViewerCountChange?.(payload.new.viewer_count);
                    if (payload.new.status === 'ended' && !this.isBroadcaster) {
                        this.onStreamEnded?.();
                    }
                }
            })
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
        } catch (err) { logError('notifyFollowers', err); }
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
        } catch (err) { logError('createLiveFeedPost', err); }
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
        const { data, error } = await supabase
            .from('live_streams')
            .select('*, broadcaster:profiles(id, username, full_name, avatar_url)')
            .eq('status', 'live')
            .order('started_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    static async getStream(streamId) {
        const { data, error } = await supabase
            .from('live_streams')
            .select('*, broadcaster:profiles(id, username, full_name, avatar_url)')
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
