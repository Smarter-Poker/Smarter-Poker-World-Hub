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
        this.onConnectionQualityChange = null;
        this.onGiftReceived = null;
        this._viewerCountDebounceTimer = null;
        this._giftChannel = null;
    }

    // ═══════════════════════════════════════════════════
    // TOKEN
    // ═══════════════════════════════════════════════════

    async _getToken(streamId, broadcaster) {
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
     */
    async startBroadcast(userId, title, mediaStream, thumbnailUrl, category) {
        this.currentUserId = userId;
        this.localStream = mediaStream;
        this.isBroadcaster = true;

        // 1. Create stream record in Supabase
        const insertPayload = {
            broadcaster_id: userId,
            title: title || 'Live Stream',
            status: 'live',
            category: category || 'general',
        };
        if (thumbnailUrl) insertPayload.thumbnail_url = thumbnailUrl;

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

        console.debug('🔴 LiveKit broadcast started:', stream.id);
        return { streamId: stream.id, stream };
    }

    /**
     * Connect to a LiveKit room
     */
    async _connectRoom(url, token, isBroadcaster, mediaStream) {
        this.room = new Room({
            adaptiveStream: true,
            dynacast: true,             // Automatically adjust quality
            publishDefaults: {
                simulcast: true,        // Publish multiple quality layers
                videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
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
            // FIX: track.mediaStream does not exist in livekit-client v2.
            // Use _trackToStream() which wraps track.mediaStreamTrack correctly.
            // Also guard against double-fire if manual participant loop already delivered the stream.
            if (track.kind === Track.Kind.Video) {
                const ms = this._trackToStream(track);
                if (ms) {
                    this._remoteStreamDelivered = true;
                    this.onRemoteStream?.(ms);
                }
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
                        simulcast: true,
                        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
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
            const { token, url } = await this._getToken(this.currentStreamId, this.isBroadcaster);
            // FIX: disconnect the old Room before creating a new one to prevent room leak
            if (this.room) {
                try { await this.room.disconnect(); } catch (_) {}
                this.room = null;
            }
            await this._connectRoom(url, token, this.isBroadcaster, this.localStream);
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            this.onReconnected?.();
        } catch (err) {
            logError('reconnect', err);
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
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.cameraMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });

            const newVideoTrack = newStream.getVideoTracks()[0];

            // Replace the published video track in LiveKit
            const localParticipant = this.room.localParticipant;
            const videoPublications = [...localParticipant.trackPublications.values()]
                .filter(pub => pub.track?.kind === Track.Kind.Video);

            for (const pub of videoPublications) {
                if (pub.track) {
                    await pub.track.replaceTrack(newVideoTrack);
                }
            }

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
     * End the current broadcast
     */
    async endBroadcast() {
        if (!this.currentStreamId) return;
        this.isManualDisconnect = true;

        // Update Supabase stream status
        await supabase
            .from('live_streams')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', this.currentStreamId);

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
        // Clean up gift channel
        if (this._giftChannel) {
            supabase.removeChannel(this._giftChannel);
            this._giftChannel = null;
        }
        console.debug('[LiveKit] Broadcast ended:', this.currentStreamId);
        const endedId = this.currentStreamId;
        this.currentStreamId = null;
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

        // Register viewer
        await supabase.from('live_viewers').upsert({ stream_id: streamId, viewer_id: userId });

        // Update peak_viewers if needed
        supabase.rpc('update_live_peak_viewers', { p_stream_id: streamId, p_count: 1 }).catch(() => {});

        // Get token and connect
        const { token, url } = await this._getToken(streamId, false);
        await this._connectRoom(url, token, false, null);

        // Handle already-published tracks that fired before TrackSubscribed listener
        // FIG: use a flag to prevent double-fire when autoSubscribe also triggers TrackSubscribed
        let remoteStreamDelivered = false;
        for (const [, participant] of this.room.remoteParticipants) {
            for (const [, publication] of participant.trackPublications) {
                if (publication.isSubscribed && publication.track) {
                    if (publication.track.kind === Track.Kind.Video && !remoteStreamDelivered) {
                        const ms = this._trackToStream(publication.track);
                        if (ms) { onRemoteStream?.(ms); remoteStreamDelivered = true; }
                    }
                }
            }
        }
        // FIX: store a flag so TrackSubscribed handler won't double-fire if loop already delivered
        this._remoteStreamDelivered = remoteStreamDelivered;

        // Subscribe to viewer count
        this._subscribeToViewers(streamId);

        console.debug('📺 Joined stream:', streamId);
        return stream;
    }

    /**
     * Leave the current stream
     */
    async leaveStream() {
        if (!this.currentStreamId || !this.currentUserId) return;
        this.isManualDisconnect = true;

        await supabase.from('live_viewers')
            .delete()
            .eq('stream_id', this.currentStreamId)
            .eq('viewer_id', this.currentUserId);

        if (this.room) {
            await this.room.disconnect();
            this.room = null;
        }

        // Clean up viewer subscription channel
        if (this._viewerChannel) {
            supabase.removeChannel(this._viewerChannel);
            this._viewerChannel = null;
        }
        console.debug('👋 Left stream:', this.currentStreamId);
        this.currentStreamId = null;
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
     * Ban a user from commenting
     */
    async banUser(streamId, bannedUserId) {
        await supabase.from('live_bans').upsert({
            stream_id: streamId,
            banned_user_id: bannedUserId,
            banned_by: this.currentUserId,
        });
    }

    /**
     * Delete a comment
     */
    async deleteComment(commentId) {
        await supabase.from('live_comments').delete().eq('id', commentId);
    }

    /**
     * Pin a comment
     */
    async pinComment(streamId, commentId) {
        await supabase.from('live_pins').upsert({
            stream_id: streamId,
            comment_id: commentId,
            pinned_by: this.currentUserId,
        });
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

        await supabase.rpc('update_live_peak_viewers', {
            p_stream_id: this.currentStreamId,
            p_count: count,
        }).catch(() => {
            supabase.from('live_streams')
                .update({ peak_viewers: count })
                .eq('id', this.currentStreamId)
                .lt('peak_viewers', count)
                .catch(() => {});
        });
        this.onViewerCountChange?.(count);
    }

    _subscribeToViewers(streamId) {
        // FIX: store channel ref so endBroadcast/leaveStream can unsubscribe
        if (this._viewerChannel) {
            supabase.removeChannel(this._viewerChannel);
        }
        this._viewerChannel = supabase
            .channel(`live-viewers-${streamId}`)
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
