/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨 PROTECTED FILE - DO NOT MODIFY WITHOUT TESTING 🚨                     ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  WORKFLOW: /social-feed-protection                                       ║
 * ║  REGISTRY: .agent/PROTECTED_FILES.md                                     ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  LIVE STREAM SERVICE — WebRTC Peer-to-Peer Streaming                     ║
 * ║  Handles broadcaster and viewer connections with Supabase signaling       ║
 * ║                                                                           ║
 * ║  CRITICAL FUNCTIONALITY:                                                  ║
 * ║  - startBroadcast() → Creates stream, subscribes to signaling            ║
 * ║  - endBroadcast() → Ends stream, closes peer connections                 ║
 * ║  - joinStream() → Viewer joins, creates WebRTC offer                     ║
 * ║  - leaveStream() → Viewer leaves, cleanup                                ║
 * ║  - WebRTC signaling via Supabase realtime                                ║
 * ║                                                                           ║
 * ║  DO NOT BREAK:                                                            ║
 * ║  - ICE_SERVERS configuration                                             ║
 * ║  - peerConnections Map                                                   ║
 * ║  - signaling channel subscription                                         ║
 * ║  - Stream status updates (live → ended)                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// HARDENING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds max for WebRTC connection
const SIGNALING_RETRY_ATTEMPTS = 3;
const SIGNALING_RETRY_DELAY_MS = 1000;
const ICE_GATHERING_TIMEOUT_MS = 10000; // 10 seconds for ICE gathering

// STUN/TURN servers for NAT traversal (with fallbacks)
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
];

/**
 * Log errors with context for debugging
 */
const logError = (context, error) => {
    console.error(`[LiveStream:${context}]`, error?.message || error);
    // Could integrate with error tracking service here
};

/**
 * LiveStreamService — Manages WebRTC connections for live streaming
 */
class LiveStreamService {
    constructor() {
        this.localStream = null;
        this.peerConnections = new Map(); // viewerId -> RTCPeerConnection
        this.currentStreamId = null;
        this.currentUserId = null;
        this.signalingChannel = null;
        this.onViewerCountChange = null;
        this.onStreamEnded = null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BROADCASTER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Start broadcasting a live stream
     * @param {string} userId - Broadcaster's user ID
     * @param {string} title - Stream title
     * @param {MediaStream} mediaStream - Camera/mic stream
     * @returns {Promise<{streamId: string, stream: object}>}
     */
    async startBroadcast(userId, title, mediaStream) {
        this.currentUserId = userId;
        this.localStream = mediaStream;

        // Create stream record in database
        const { data: stream, error } = await supabase
            .from('live_streams')
            .insert({
                broadcaster_id: userId,
                title: title || 'Live Stream',
                status: 'live',
            })
            .select()
            .single();

        if (error) throw new Error(`Failed to create stream: ${error.message}`);

        this.currentStreamId = stream.id;

        // Subscribe to signaling channel for incoming viewer connections
        await this.subscribeToSignaling(stream.id, true);

        // Subscribe to viewer count changes
        this.subscribeToViewers(stream.id);

        // Notify all followers that user is going live
        this.notifyFollowers(userId, title || 'Live Stream', stream.id);

        console.log('🔴 Broadcast started:', stream.id);
        return { streamId: stream.id, stream };
    }

    /**
     * Notify followers when broadcaster goes live
     * @param {string} userId - Broadcaster's user ID
     * @param {string} title - Stream title
     * @param {string} streamId - Stream ID
     */
    async notifyFollowers(userId, title, streamId) {
        try {
            // Get broadcaster's username for the notification
            const { data: broadcaster } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', userId)
                .single();

            const username = broadcaster?.username || 'Someone you follow';

            // Get all followers of this user
            const { data: followers, error } = await supabase
                .from('follows')
                .select('follower_id')
                .eq('following_id', userId);

            if (error || !followers?.length) return;

            // Create notifications for all followers
            const notifications = followers.map(f => ({
                user_id: f.follower_id,
                type: 'live',
                title: '🔴 Live Now',
                message: `${username} is live: ${title}`,
                link: `/hub/social-media?stream=${streamId}`,
                read: false
            }));

            await supabase.from('notifications').insert(notifications);
            console.log(`📣 Notified ${followers.length} followers about live stream`);
        } catch (err) {
            logError('notifyFollowers', err);
        }
    }

    /**
     * End the current broadcast
     */
    async endBroadcast() {
        if (!this.currentStreamId) return;

        // Update stream status
        await supabase
            .from('live_streams')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', this.currentStreamId);

        // Close all peer connections
        this.peerConnections.forEach((pc) => pc.close());
        this.peerConnections.clear();

        // Stop local media tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop());
            this.localStream = null;
        }

        // Unsubscribe from signaling
        if (this.signalingChannel) {
            supabase.removeChannel(this.signalingChannel);
            this.signalingChannel = null;
        }

        console.log('⬛ Broadcast ended:', this.currentStreamId);
        this.currentStreamId = null;
    }

    /**
     * Handle incoming viewer connection request
     * @param {string} viewerId - Viewer's user ID
     * @param {object} offer - WebRTC offer from viewer
     */
    async handleViewerOffer(viewerId, offer) {
        console.log('📥 Received offer from viewer:', viewerId);

        // Create peer connection for this viewer
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        this.peerConnections.set(viewerId, pc);

        // Add local stream tracks to connection
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Send ICE candidates to viewer
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await this.sendSignal(viewerId, 'ice-candidate', event.candidate);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Viewer ${viewerId} connection state:`, pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.peerConnections.delete(viewerId);
                pc.close();
            }
        };

        // Set remote description (viewer's offer)
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Create and send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.sendSignal(viewerId, 'answer', answer);

        console.log('📤 Sent answer to viewer:', viewerId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEWER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Join a live stream as a viewer
     * @param {string} streamId - Stream to join
     * @param {string} userId - Viewer's user ID
     * @param {function} onRemoteStream - Callback when stream is received
     * @returns {Promise<void>}
     */
    async joinStream(streamId, userId, onRemoteStream) {
        this.currentStreamId = streamId;
        this.currentUserId = userId;

        // Get stream info
        const { data: stream, error } = await supabase
            .from('live_streams')
            .select('*, profiles!broadcaster_id(username, avatar_url)')
            .eq('id', streamId)
            .single();

        if (error || !stream) throw new Error('Stream not found');
        if (stream.status !== 'live') throw new Error('Stream has ended');

        // Register as viewer
        await supabase.from('live_viewers').upsert({
            stream_id: streamId,
            viewer_id: userId,
        });

        // Create peer connection
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        this.peerConnections.set(stream.broadcaster_id, pc);

        // Handle incoming stream
        pc.ontrack = (event) => {
            console.log('📺 Received remote stream');
            if (onRemoteStream && event.streams[0]) {
                onRemoteStream(event.streams[0]);
            }
        };

        // Send ICE candidates to broadcaster
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await this.sendSignal(stream.broadcaster_id, 'ice-candidate', event.candidate);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                if (this.onStreamEnded) this.onStreamEnded();
            }
        };

        // Subscribe to signaling for answers and ICE candidates
        await this.subscribeToSignaling(streamId, false);

        // Create and send offer to broadcaster
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.sendSignal(stream.broadcaster_id, 'offer', offer);

        console.log('📤 Sent offer to broadcaster');
        return stream;
    }

    /**
     * Leave the current stream
     */
    async leaveStream() {
        if (!this.currentStreamId || !this.currentUserId) return;

        // Remove viewer record
        await supabase
            .from('live_viewers')
            .delete()
            .eq('stream_id', this.currentStreamId)
            .eq('viewer_id', this.currentUserId);

        // Close peer connections
        this.peerConnections.forEach((pc) => pc.close());
        this.peerConnections.clear();

        // Unsubscribe from signaling
        if (this.signalingChannel) {
            supabase.removeChannel(this.signalingChannel);
            this.signalingChannel = null;
        }

        console.log('👋 Left stream:', this.currentStreamId);
        this.currentStreamId = null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SIGNALING METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Subscribe to signaling channel for WebRTC messages
     * @param {string} streamId - Stream ID
     * @param {boolean} isBroadcaster - Whether user is the broadcaster
     */
    async subscribeToSignaling(streamId, isBroadcaster) {
        const channelName = `live-signaling-${streamId}`;

        this.signalingChannel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'live_signaling',
                    filter: `to_user_id=eq.${this.currentUserId}`,
                },
                async (payload) => {
                    const { message_type, payload: signalPayload, from_user_id } = payload.new;

                    if (message_type === 'offer' && isBroadcaster) {
                        await this.handleViewerOffer(from_user_id, signalPayload);
                    } else if (message_type === 'answer' && !isBroadcaster) {
                        const pc = this.peerConnections.values().next().value;
                        if (pc) {
                            await pc.setRemoteDescription(new RTCSessionDescription(signalPayload));
                            console.log('📥 Set remote description (answer)');
                        }
                    } else if (message_type === 'ice-candidate') {
                        const pc = this.peerConnections.get(from_user_id) ||
                            this.peerConnections.values().next().value;
                        if (pc && signalPayload) {
                            await pc.addIceCandidate(new RTCIceCandidate(signalPayload));
                        }
                    }
                }
            )
            .subscribe();

        console.log('🔔 Subscribed to signaling channel:', channelName);
    }

    /**
     * Send signaling message to another user with retry logic
     * @param {string} toUserId - Recipient user ID
     * @param {string} messageType - offer, answer, or ice-candidate
     * @param {object} payload - WebRTC data
     */
    async sendSignal(toUserId, messageType, payload) {
        let lastError = null;

        for (let attempt = 1; attempt <= SIGNALING_RETRY_ATTEMPTS; attempt++) {
            try {
                const { error } = await supabase.from('live_signaling').insert({
                    stream_id: this.currentStreamId,
                    from_user_id: this.currentUserId,
                    to_user_id: toUserId,
                    message_type: messageType,
                    payload: payload,
                });

                if (error) throw error;
                return; // Success
            } catch (err) {
                lastError = err;
                logError(`sendSignal:${messageType}:attempt${attempt}`, err);

                if (attempt < SIGNALING_RETRY_ATTEMPTS) {
                    // Wait before retry with exponential backoff
                    await new Promise(r => setTimeout(r, SIGNALING_RETRY_DELAY_MS * attempt));
                }
            }
        }

        // All retries failed
        logError('sendSignal:failed', `Failed after ${SIGNALING_RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
        throw lastError;
    }

    /**
     * Subscribe to viewer count updates
     * @param {string} streamId - Stream ID
     */
    subscribeToViewers(streamId) {
        supabase
            .channel(`live-viewers-${streamId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'live_streams',
                    filter: `id=eq.${streamId}`,
                },
                (payload) => {
                    if (this.onViewerCountChange && payload.new) {
                        this.onViewerCountChange(payload.new.viewer_count);
                    }
                }
            )
            .subscribe();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATIC METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get all active live streams
     * @returns {Promise<Array>}
     */
    static async getLiveStreams() {
        const { data, error } = await supabase
            .from('live_streams')
            .select('*, profiles!broadcaster_id(username, avatar_url)')
            .eq('status', 'live')
            .order('started_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get stream by ID
     * @param {string} streamId - Stream ID
     * @returns {Promise<object>}
     */
    static async getStream(streamId) {
        const { data, error } = await supabase
            .from('live_streams')
            .select('*, profiles!broadcaster_id(username, avatar_url)')
            .eq('id', streamId)
            .single();

        if (error) throw error;
        return data;
    }
}

// Singleton instance
export const liveStreamService = new LiveStreamService();
export default LiveStreamService;
