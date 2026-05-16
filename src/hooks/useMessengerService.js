/**
 * useMessengerService.js — Phase 12: Shared Messenger Backend Service
 * 
 * Provides Supabase persistence, Realtime subscriptions, WebRTC signaling,
 * reactions, read receipts, full-text search, media upload, offline queue,
 * and rate limiting for both SmarterPokerMessenger & ClubArenaMessenger.
 *
 * Usage: const svc = useMessengerService({ conversationId, currentUser, messengerType });
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { eventBus, EventType } from '../engine/EventBus';
// Lazy Supabase getter (SSG-safe)
// ═══════════════════════════════════════════════════════════════
let _supabase = null;
function getSupabase() {
    if (_supabase) return _supabase;
    if (typeof window === 'undefined') return null;
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    return _supabase;
}

// ═══════════════════════════════════════════════════════════════
// P14-1: STUN/TURN Config (with Twilio/Xirsys TURN fallback)
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // P14-1: Paid TURN relays — set env vars for production
        ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
            urls: process.env.NEXT_PUBLIC_TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME || '',
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '',
        }] : []),
        ...(process.env.NEXT_PUBLIC_TURN_URL_2 ? [{
            urls: process.env.NEXT_PUBLIC_TURN_URL_2,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME_2 || '',
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL_2 || '',
        }] : []),
    ]
};

// ═══════════════════════════════════════════════════════════════
// P12-12: Rate Limiter (30 msg/min per conversation)
// ═══════════════════════════════════════════════════════════════
const rateLimitMap = new Map();
function checkRateLimit(conversationId, limit = 30, windowMs = 60000) {
    const now = Date.now();
    const key = conversationId;
    if (!rateLimitMap.has(key)) rateLimitMap.set(key, []);
    const timestamps = rateLimitMap.get(key).filter(t => now - t < windowMs);
    if (timestamps.length >= limit) return false;
    timestamps.push(now);
    rateLimitMap.set(key, timestamps);
    return true;
}

// ═══════════════════════════════════════════════════════════════
// P12-11: Offline Queue (IndexedDB)
// ═══════════════════════════════════════════════════════════════
const OFFLINE_STORE = 'messenger_offline_queue';

async function getOfflineDB() {
    if (typeof window === 'undefined' || !window.indexedDB) return null;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('MessengerOfflineDB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
                db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function queueOfflineMessage(msg) {
    try {
        const db = await getOfflineDB();
        if (!db) return;
        const tx = db.transaction(OFFLINE_STORE, 'readwrite');
        tx.objectStore(OFFLINE_STORE).add({ ...msg, queued_at: Date.now() });
    } catch (e) { console.warn('[Offline] Queue failed:', e); }
}

async function drainOfflineQueue(sendFn) {
    try {
        const db = await getOfflineDB();
        if (!db) return;
        const tx = db.transaction(OFFLINE_STORE, 'readwrite');
        const store = tx.objectStore(OFFLINE_STORE);
        const all = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        for (const msg of all) {
            try {
                await sendFn(msg);
                store.delete(msg.id);
            } catch (_) { break; } // Stop on first failure, retry later
        }
    } catch (e) { console.warn('[Offline] Drain failed:', e); }
}

// ═══════════════════════════════════════════════════════════════
// Main Hook
// ═══════════════════════════════════════════════════════════════
export function useMessengerService({ conversationId, currentUser, messengerType = 'social' }) {
    const [messages, setMessages] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [searchResults, setSearchResults] = useState([]);
    
    const realtimeChannelRef = useRef(null);
    const callSignalChannelRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    // P17-1: Ref for blocked users (avoids stale closure in Realtime + loadMessages)
    const blockedUsersRef = useRef([]);

    // ═══════════════════════════════════════════════════════════
    // P12-2: Load Messages from Supabase
    // ═══════════════════════════════════════════════════════════
    const loadMessages = useCallback(async (page = 1, perPage = 50) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return [];
        try {
            const { data, error } = await supabase
                .from('messenger_messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .range((page - 1) * perPage, page * perPage - 1);

            if (error) { console.warn('[Messenger] Load messages error:', error); return []; }
            // P17-1: Filter out messages from blocked users
            const filtered = (data || []).filter(m => !blockedUsersRef.current.includes(m.sender_id));
            setMessages(prev => page === 1 ? filtered : [...filtered, ...prev]);
            return filtered;
        } catch (e) { console.warn('[Messenger] Load error:', e); return []; }
    }, [conversationId]);

    // ═══════════════════════════════════════════════════════════
    // P12-2: Send Message → Supabase (with P12-12 rate limit + P12-11 offline queue)
    // ═══════════════════════════════════════════════════════════
    const sendMessage = useCallback(async (text, metadata = {}) => {
        if (!conversationId || !currentUser?.id) return null;

        // P12-12: Rate limit check
        if (!checkRateLimit(conversationId)) {
            console.warn('[Messenger] Rate limit exceeded (30/min)');
            return null;
        }

        const msgPayload = {
            conversation_id: conversationId,
            sender_id: currentUser.id,
            text: text || null,
            message_type: metadata.contactCard ? 'contact_card' :
                          metadata.location ? 'location' :
                          metadata.poll ? 'poll' :
                          metadata.file?.type?.startsWith('image/') ? 'image' :
                          metadata.file?.type === 'image/gif' ? 'gif' :
                          metadata.isVoice ? 'voice' :
                          metadata.file ? 'file' : 'text',
            media_url: metadata.image || metadata.mediaUrl || null,
            media_metadata: metadata.file ? { name: metadata.file.name, type: metadata.file.type, size: metadata.file.size } : {},
            contact_card: metadata.contactCard || null,
            location: metadata.location || null,
            poll_data: metadata.poll || null,
            reply_to_id: metadata.replyToId || null,
            thread_parent_id: metadata.threadParentId || null,
            priority: metadata.priority || 'normal',
            is_encrypted: metadata.isEncrypted || false,
            encrypted_payload: metadata.encryptedPayload || null,
            status: 'sent',
        };

        // P12-11: If offline, queue and return
        if (!isOnline) {
            await queueOfflineMessage(msgPayload);
            // Optimistic local add
            setMessages(prev => [...prev, { ...msgPayload, id: `offline-${Date.now()}`, created_at: new Date().toISOString() }]);
            return { offline: true };
        }

        const supabase = getSupabase();
        if (!supabase) return null;

        try {
            const { data, error } = await supabase
                .from('messenger_messages')
                .insert(msgPayload)
                .select('*')
                .maybeSingle();

            if (error) throw error;

            // Update conversation last_message
            const { error: err_messenger_conversations_5ou7a } = await supabase
              .from('messenger_conversations')
              .update({
                    last_message_text: (text || msgPayload.message_type).slice(0, 100),
                    last_message_at: new Date().toISOString()
                })
                .eq('id', conversationId);
            if (err_messenger_conversations_5ou7a) console.warn('[Supabase] Silent mutation failed in messenger_conversations:', err_messenger_conversations_5ou7a.message);

            // P12-8: Trigger push notification
            triggerPushNotification(conversationId, currentUser, text);

            return data;
        } catch (e) {
            console.warn('[Messenger] Send error:', e);
            await queueOfflineMessage(msgPayload);
            return null;
        }
    }, [conversationId, currentUser, isOnline]);

    // ═══════════════════════════════════════════════════════════
    // P12-1: Realtime Subscription
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return;

        // Subscribe to new messages
        const channel = supabase
            .channel(`messages:${conversationId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messenger_messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => {
                const newMsg = payload.new;
                // Don't duplicate own messages (already added optimistically)
                if (newMsg.sender_id === currentUser?.id) return;
                // P17-1: Filter blocked user messages from Realtime
                if (blockedUsersRef.current.includes(newMsg.sender_id)) return;
                setMessages(prev => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
                setUnreadCount(prev => prev + 1);
                
                // P17-7: Play notification sound on incoming message
                playNotificationSound(conversationId);
                
                // P13-2: Emit event for HUD listeners (like LivePokerTable)
                eventBus.emit(EventType.MESSAGE_RECEIVED, {
                    message: newMsg,
                    conversationId
                });
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messenger_messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => {
                const updated = payload.new;
                setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
            })
            .subscribe();

        realtimeChannelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            realtimeChannelRef.current = null;
        };
    }, [conversationId, currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-3: Reaction Persistence
    // ═══════════════════════════════════════════════════════════
    const addReaction = useCallback(async (messageId, emoji, type = 'emoji', gifUrl = null) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { error } = await supabase.from('messenger_reactions').upsert({
                message_id: messageId,
                user_id: currentUser.id,
                reaction_type: type,
                emoji: type === 'emoji' ? emoji : null,
                gif_url: type === 'gif' ? gifUrl : null,
            }, { onConflict: 'message_id,user_id,emoji' });
            if (error) throw error;
        } catch (e) {
            console.warn('[Reaction] Add error:', e);
            throw e;
        }
    }, [currentUser?.id]);

    const removeReaction = useCallback(async (messageId, emoji) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { error } = await supabase.from('messenger_reactions')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', currentUser.id)
                .eq('emoji', emoji);
            if (error) throw error;
        } catch (e) {
            console.warn('[Reaction] Remove error:', e);
            throw e;
        }
    }, [currentUser?.id]);

    const loadReactions = useCallback(async (messageId) => {
        const supabase = getSupabase();
        if (!supabase) return [];
        try {
            const { data } = await supabase
                .from('messenger_reactions')
                .select('*')
                .eq('message_id', messageId);
            return data || [];
        } catch (e) { return []; }
    }, []);

    // ═══════════════════════════════════════════════════════════
    // P12-4: Read Receipt Updates
    // ═══════════════════════════════════════════════════════════
    const markAsRead = useCallback(async (messageIds) => {
        const supabase = getSupabase();
        if (!supabase || !messageIds?.length || !currentUser?.id) return;
        try {
            // Only mark messages from OTHER users as read
            const { error: err_messenger_messages_hrt1r } = await supabase
              .from('messenger_messages')
              .update({ status: 'read', updated_at: new Date().toISOString() })
                .in('id', messageIds)
                .neq('sender_id', currentUser.id)
                .eq('conversation_id', conversationId);
            if (err_messenger_messages_hrt1r) console.warn('[Supabase] Silent mutation failed in messenger_messages:', err_messenger_messages_hrt1r.message);

            // Reset unread count for this participant
            const { error: err_messenger_participants_l4vqc } = await supabase
              .from('messenger_participants')
              .update({ unread_count: 0, last_read_at: new Date().toISOString() })
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
            if (err_messenger_participants_l4vqc) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_l4vqc.message);

            setUnreadCount(0);
        } catch (e) { console.warn('[ReadReceipt] Update error:', e); }
    }, [conversationId, currentUser?.id]);

    const markAsDelivered = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return;
        try {
            const { error: err_messenger_messages_qbokp } = await supabase
              .from('messenger_messages')
              .update({ status: 'delivered' })
                .eq('conversation_id', conversationId)
                .eq('status', 'sent')
                .neq('sender_id', currentUser.id);
            if (err_messenger_messages_qbokp) console.warn('[Supabase] Silent mutation failed in messenger_messages:', err_messenger_messages_qbokp.message);
        } catch (e) { console.warn('[ReadReceipt] Delivery update error:', e); }
    }, [conversationId, currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-5: WebRTC Signaling Loop
    // ═══════════════════════════════════════════════════════════
    const startCall = useCallback(async (calleeId, callType = 'audio') => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || typeof window === 'undefined') return null;

        try {
            // Get local media stream
            const constraints = callType === 'video'
                ? { audio: true, video: { width: 640, height: 480 } }
                : { audio: true };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;

            // Create peer connection
            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerConnectionRef.current = pc;
            remoteStreamRef.current = new MediaStream();

            // Add tracks
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Handle remote tracks
            pc.ontrack = (event) => {
                event.streams[0]?.getTracks().forEach(track => {
                    remoteStreamRef.current.addTrack(track);
                });
            };

            // ICE candidates → Supabase
            pc.onicecandidate = async (event) => {
                if (event.candidate) {
                    const { error: err_messenger_call_signals_k580m } = await supabase.from('messenger_call_signals').insert({
                        conversation_id: conversationId,
                        caller_id: currentUser.id,
                        callee_id: calleeId,
                        call_type: callType,
                        signal_type: 'ice_candidate',
                        signal_data: { candidate: event.candidate.toJSON() },
                        status: 'active',
                    });
                    if (err_messenger_call_signals_k580m) console.warn('[Supabase] Silent mutation failed in messenger_call_signals:', err_messenger_call_signals_k580m.message);
                }
            };

            // Create and send offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const { error: err_messenger_call_signals_bwfvf } = await supabase.from('messenger_call_signals').insert({
                conversation_id: conversationId,
                caller_id: currentUser.id,
                callee_id: calleeId,
                call_type: callType,
                signal_type: 'offer',
                signal_data: { sdp: offer.sdp, type: offer.type },
                status: 'pending',
            });

            if (err_messenger_call_signals_bwfvf) console.warn('[Supabase] Silent mutation failed in messenger_call_signals:', err_messenger_call_signals_bwfvf.message);

            // Listen for answer + ICE candidates from callee
            const signalChannel = supabase
                .channel(`call_signals:${conversationId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messenger_call_signals',
                    filter: `conversation_id=eq.${conversationId}`
                }, async (payload) => {
                    const signal = payload.new;
                    if (signal.caller_id === currentUser.id) return; // Ignore own signals

                    if (signal.signal_type === 'offer' && pc.signalingState === 'stable') {
                        // P13-3: Emit event for HUD listeners to auto-open the call modal
                        eventBus.emit(EventType.CALL_STARTED, {
                            callerId: signal.caller_id,
                            calleeId: signal.callee_id,
                            callType: signal.call_type
                        });
                    }
                    if (signal.signal_type === 'answer' && pc.signalingState !== 'stable') {
                        await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data));
                    }
                    if (signal.signal_type === 'ice_candidate' && signal.signal_data?.candidate) {
                        await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
                    }
                    if (signal.signal_type === 'hangup') {
                        endCall();
                    }
                })
                .subscribe();

            callSignalChannelRef.current = signalChannel;

            return { localStream: stream, remoteStream: remoteStreamRef.current, pc };
        } catch (e) {
            console.warn('[WebRTC] Start call error:', e);
            return null;
        }
    }, [conversationId, currentUser?.id]);

    const answerCall = useCallback(async (signalData, callerId, callType = 'audio') => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || typeof window === 'undefined') return null;

        try {
            const constraints = callType === 'video'
                ? { audio: true, video: { width: 640, height: 480 } }
                : { audio: true };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;

            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerConnectionRef.current = pc;
            remoteStreamRef.current = new MediaStream();

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
                event.streams[0]?.getTracks().forEach(track => {
                    remoteStreamRef.current.addTrack(track);
                });
            };

            pc.onicecandidate = async (event) => {
                if (event.candidate) {
                    const { error: err_messenger_call_signals_t3qk4 } = await supabase.from('messenger_call_signals').insert({
                        conversation_id: conversationId,
                        caller_id: currentUser.id,
                        callee_id: callerId,
                        call_type: callType,
                        signal_type: 'ice_candidate',
                        signal_data: { candidate: event.candidate.toJSON() },
                        status: 'active',
                    });
                    if (err_messenger_call_signals_t3qk4) console.warn('[Supabase] Silent mutation failed in messenger_call_signals:', err_messenger_call_signals_t3qk4.message);
                }
            };

            // Set remote offer
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));

            // Create and send answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const { error: err_messenger_call_signals_messx } = await supabase.from('messenger_call_signals').insert({
                conversation_id: conversationId,
                caller_id: currentUser.id,
                callee_id: callerId,
                call_type: callType,
                signal_type: 'answer',
                signal_data: { sdp: answer.sdp, type: answer.type },
                status: 'active',
            });

            if (err_messenger_call_signals_messx) console.warn('[Supabase] Silent mutation failed in messenger_call_signals:', err_messenger_call_signals_messx.message);

            return { localStream: stream, remoteStream: remoteStreamRef.current, pc };
        } catch (e) {
            console.warn('[WebRTC] Answer call error:', e);
            return null;
        }
    }, [conversationId, currentUser?.id]);

    const endCall = useCallback(async () => {
        const supabase = getSupabase();

        // Stop all tracks
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        remoteStreamRef.current?.getTracks().forEach(t => t.stop());
        peerConnectionRef.current?.close();

        localStreamRef.current = null;
        remoteStreamRef.current = null;
        peerConnectionRef.current = null;

        // Signal hangup
        if (supabase && conversationId && currentUser?.id) {
            try {
                const { error: err_messenger_call_signals_rvnv7 } = await supabase.from('messenger_call_signals').insert({
                    conversation_id: conversationId,
                    caller_id: currentUser.id,
                    callee_id: currentUser.id, // Self-hangup signal
                    call_type: 'audio',
                    signal_type: 'hangup',
                    signal_data: {},
                    status: 'ended',
                });
                if (err_messenger_call_signals_rvnv7) console.warn('[Supabase] Silent mutation failed in messenger_call_signals:', err_messenger_call_signals_rvnv7.message);
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }

        // Clean up Realtime channel
        if (callSignalChannelRef.current) {
            supabase?.removeChannel(callSignalChannelRef.current);
            callSignalChannelRef.current = null;
        }
    }, [conversationId, currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-7: Unread Badge Counter
    // ═══════════════════════════════════════════════════════════
    const refreshUnreadCount = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return 0;
        try {
            const { count } = await supabase
                .from('messenger_messages')
                .select('*', { count: 'exact', head: true })
                .neq('sender_id', currentUser.id)
                .neq('status', 'read')
                .in('conversation_id',
                    (await supabase
                        .from('messenger_participants')
                        .select('conversation_id')
                        .eq('user_id', currentUser.id)
                    ).data?.map(p => p.conversation_id) || []
                );
            setUnreadCount(count || 0);
            return count || 0;
        } catch (e) { return 0; }
    }, [currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-8: Push Notification Trigger
    // ═══════════════════════════════════════════════════════════
    const triggerPushNotification = async (convId, sender, text) => {
        try {
            await fetch('/api/notifications/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: convId,
                    senderName: sender?.name || 'Someone',
                    message: (text || 'New message').slice(0, 100),
                    type: 'messenger_message',
                }),
            });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    };

    // ═══════════════════════════════════════════════════════════
    // P12-9: Full-Text Search
    // ═══════════════════════════════════════════════════════════
    const searchMessages = useCallback(async (query) => {
        const supabase = getSupabase();
        if (!supabase || !query?.trim() || !currentUser?.id) { setSearchResults([]); return []; }
        try {
            const { data } = await supabase
                .from('messenger_messages')
                .select('*')
                .textSearch('text', query, { type: 'websearch' })
                .in('conversation_id',
                    (await supabase
                        .from('messenger_participants')
                        .select('conversation_id')
                        .eq('user_id', currentUser.id)
                    ).data?.map(p => p.conversation_id) || []
                )
                .order('created_at', { ascending: false })
                .limit(25);
            setSearchResults(data || []);
            return data || [];
        } catch (e) {
            console.warn('[Search] Error:', e);
            // Fallback to ILIKE search
            try {
                const { data } = await supabase
                    .from('messenger_messages')
                    .select('*')
                    .ilike('text', `%${query}%`)
                    .order('created_at', { ascending: false })
                    .limit(25);
                setSearchResults(data || []);
                return data || [];
            } catch (_) { return []; }
        }
    }, [currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-10: Load Conversation List
    // ═══════════════════════════════════════════════════════════
    const loadConversations = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return [];
        try {
            // Get my participant records
            const { data: participantData } = await supabase
                .from('messenger_participants')
                .select('conversation_id, is_pinned, unread_count, role')
                .eq('user_id', currentUser.id);

            if (!participantData?.length) { setConversations([]); return []; }

            const convIds = participantData.map(p => p.conversation_id);

            // Get conversations
            const { data: convData } = await supabase
                .from('messenger_conversations')
                .select('*')
                .in('id', convIds)
                .order('last_message_at', { ascending: false });

            // Fetch ALL participants for these conversations (with profiles)
            const { data: allParticipants } = await supabase
                .from('messenger_participants')
                .select('conversation_id, user_id, role')
                .in('conversation_id', convIds);

            // Batch-fetch unique profile IDs
            const uniqueUserIds = [...new Set((allParticipants || []).map(p => p.user_id))];
            let profileMap = {};
            if (uniqueUserIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, full_name, is_vip')
                    .in('id', uniqueUserIds);
                (profiles || []).forEach(p => { profileMap[p.id] = p; });
            }

            // Build participants array per conversation
            const participantsByConvo = {};
            (allParticipants || []).forEach(p => {
                if (!participantsByConvo[p.conversation_id]) participantsByConvo[p.conversation_id] = [];
                const profile = profileMap[p.user_id];
                participantsByConvo[p.conversation_id].push({
                    id: p.user_id,
                    name: profile?.full_name || profile?.username || 'Unknown',
                    avatar: profile?.avatar_url || null,
                    role: p.role || 'member',
                    isVip: profile?.is_vip || false,
                });
            });

            // Merge participant info
            const merged = (convData || []).map(conv => {
                const participant = participantData.find(p => p.conversation_id === conv.id);
                return {
                    ...conv,
                    isPinned: participant?.is_pinned || false,
                    unreadCount: participant?.unread_count || 0,
                    myRole: participant?.role || 'member',
                    participants: participantsByConvo[conv.id] || [],
                };
            });

            // Sort: pinned first, then by last message time
            merged.sort((a, b) => {
                if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
                return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
            });

            setConversations(merged);
            return merged;
        } catch (e) {
            console.warn('[Messenger] Load conversations error:', e);
            return [];
        }
    }, [currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-10: Soft Delete Message
    // ═══════════════════════════════════════════════════════════
    const deleteMessage = useCallback(async (messageId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { error } = await supabase
                .from('messenger_messages')
                .update({ is_deleted: true, text: null, media_url: null, updated_at: new Date().toISOString() })
                .eq('id', messageId)
                .eq('sender_id', currentUser.id);
            if (error) throw error;
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true, text: null } : m));
        } catch (e) {
            console.warn('[Messenger] Delete error:', e);
            throw e;
        }
    }, [currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-13: Media Upload to Supabase Storage
    // ═══════════════════════════════════════════════════════════
    const uploadMedia = useCallback(async (file) => {
        const supabase = getSupabase();
        if (!supabase || !file || !currentUser?.id) return null;
        try {
            const ext = file.name?.split('.').pop() || 'bin';
            const path = `messenger/${currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

            const { data, error } = await supabase.storage
                .from('uploads')
                .upload(path, file, {
                    cacheControl: '3600',
                    contentType: file.type,
                    upsert: false,
                });

            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from('uploads')
                .getPublicUrl(path);

            return urlData?.publicUrl || null;
        } catch (e) {
            console.warn('[Upload] Failed:', e);
            return null;
        }
    }, [currentUser?.id]);

    // ═══════════════════════════════════════════════════════════
    // P12-14: E2E Key Exchange
    // ═══════════════════════════════════════════════════════════
    const exchangePublicKey = useCallback(async (publicKeyJwk) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return;
        try {
            const { error: err_messenger_participants_nn92e } = await supabase
              .from('messenger_participants')
              .update({
                    metadata: { public_key: publicKeyJwk }
                })
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
            if (err_messenger_participants_nn92e) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_nn92e.message);
        } catch (e) { console.warn('[E2E] Key exchange error:', e); }
    }, [conversationId, currentUser?.id]);

    const getRemotePublicKey = useCallback(async (remoteUserId) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return null;
        try {
            const { data } = await supabase
                .from('messenger_participants')
                .select('metadata')
                .eq('conversation_id', conversationId)
                .eq('user_id', remoteUserId)
                .maybeSingle();
            return data?.metadata?.public_key || null;
        } catch (e) { return null; }
    }, [conversationId]);

    // ═══════════════════════════════════════════════════════════
    // Online/Offline Listener + Queue Drain
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleOnline = () => {
            setIsOnline(true);
            // Drain P12 IndexedDB offline queue
            drainOfflineQueue(async (msg) => {
                const supabase = getSupabase();
                if (!supabase) return;
                const { error: err_messenger_messages_hgowl } = await supabase.from('messenger_messages').insert(msg);
                if (err_messenger_messages_hgowl) console.warn('[Supabase] Silent mutation failed in messenger_messages:', err_messenger_messages_hgowl.message);
            });
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Load initial messages when conversation changes
    useEffect(() => {
        if (conversationId) {
            loadMessages(1);
            markAsDelivered();
        }
    }, [conversationId, loadMessages, markAsDelivered]);

    // ═════════════════════════════════════════════════════════
    // P14-2: Presence Indicators (Supabase Presence Channel)
    // ═════════════════════════════════════════════════════════
    const [onlineUsers, setOnlineUsers] = useState({});
    const [typingUsers, setTypingUsers] = useState({});
    const presenceChannelRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    useEffect(() => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return;

        const channel = supabase.channel(`presence:${conversationId}`, {
            config: { presence: { key: currentUser.id } }
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const online = {};
                Object.keys(state || {}).forEach(uid => { online[uid] = true; });
                setOnlineUsers(online);
            })
            .on('presence', { event: 'join' }, ({ key }) => {
                setOnlineUsers(prev => ({ ...prev, [key]: true }));
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                setOnlineUsers(prev => { const n = { ...prev }; delete n[key]; return n; });
                setTypingUsers(prev => { const n = { ...prev }; delete n[key]; return n; });
            })
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (payload.userId === currentUser.id) return;
                setTypingUsers(prev => ({ ...prev, [payload.userId]: payload.isTyping }));
                // Auto-clear after 4s
                if (payload.isTyping) {
                    setTimeout(() => {
                        setTypingUsers(prev => { const n = { ...prev }; delete n[payload.userId]; return n; });
                    }, 4000);
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ online_at: new Date().toISOString(), user_id: currentUser.id });
                }
            });

        presenceChannelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            presenceChannelRef.current = null;
        };
    }, [conversationId, currentUser?.id]);

    const sendTypingIndicator = useCallback((isTyping = true) => {
        if (!presenceChannelRef.current || !currentUser?.id) return;
        clearTimeout(typingTimeoutRef.current);
        presenceChannelRef.current.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: currentUser.id, isTyping }
        });
        if (isTyping) {
            typingTimeoutRef.current = setTimeout(() => {
                presenceChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { userId: currentUser.id, isTyping: false }
                });
            }, 3000);
        }
    }, [currentUser?.id]);

    // ═════════════════════════════════════════════════════════
    // P14-3: Read Receipt Status Helper
    // ═════════════════════════════════════════════════════════
    const getReceiptIcon = useCallback((msg) => {
        if (!msg || msg.sender_id !== currentUser?.id) return null;
        if (msg.status === 'read') return { icon: '✓✓', color: '#2D88FF', label: 'Read' };
        if (msg.status === 'delivered') return { icon: '✓✓', color: '#B0B3B8', label: 'Delivered' };
        return { icon: '✓', color: '#B0B3B8', label: 'Sent' };
    }, [currentUser?.id]);

    // ═════════════════════════════════════════════════════════
    // P14-5: Link Preview Fetcher
    // ═════════════════════════════════════════════════════════
    const linkPreviewCache = useRef({});
    const fetchLinkPreview = useCallback(async (url) => {
        if (!url) return null;
        if (linkPreviewCache.current[url]) return linkPreviewCache.current[url];
        try {
            const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
            if (!res.ok) return null;
            const data = await res.json();
            linkPreviewCache.current[url] = data;
            return data;
        } catch (_) { return null; }
    }, []);

    // ═════════════════════════════════════════════════════════
    // P14-4: Voice Waveform Analysis
    // ═════════════════════════════════════════════════════════
    const analyzeAudioWaveform = useCallback(async (audioUrl, barCount = 40) => {
        if (typeof window === 'undefined' || !audioUrl) return Array(barCount).fill(0.3);
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const res = await fetch(audioUrl);
            const buffer = await res.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(buffer);
            const channelData = audioBuffer.getChannelData(0);
            const step = Math.floor(channelData.length / barCount);
            const bars = [];
            for (let i = 0; i < barCount; i++) {
                let sum = 0;
                for (let j = 0; j < step; j++) {
                    sum += Math.abs(channelData[i * step + j] || 0);
                }
                bars.push(Math.min(1, (sum / step) * 3));
            }
            ctx.close();
            return bars;
        } catch (_) { return Array(barCount).fill(0.3); }
    }, []);

    // ═════════════════════════════════════════════════════════
    // P14-7: Message Forwarding
    // ═════════════════════════════════════════════════════════
    const forwardMessage = useCallback(async (messageId, targetConversationId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !messageId || !targetConversationId) return null;
        try {
            // Get original message
            const { data: original } = await supabase
                .from('messenger_messages')
                .select('*')
                .eq('id', messageId)
                .maybeSingle();
            if (!original) return null;

            // Insert forwarded copy
            const { data, error } = await supabase
                .from('messenger_messages')
                .insert({
                    conversation_id: targetConversationId,
                    sender_id: currentUser.id,
                    message_type: original.message_type,
                    text: original.text,
                    media_url: original.media_url,
                    media_metadata: { ...original.media_metadata, forwarded_from: messageId, original_sender: original.sender_id },
                    status: 'sent',
                })
                .select('*')
                .maybeSingle();
            if (error) throw error;

            // Update target conversation last_message
            const { error: err_messenger_conversations_qp7ok } = await supabase
              .from('messenger_conversations')
              .update({ last_message_text: `Forwarded: ${(original.text || original.message_type).slice(0, 80)}`, last_message_at: new Date().toISOString() })
                .eq('id', targetConversationId);
            if (err_messenger_conversations_qp7ok) console.warn('[Supabase] Silent mutation failed in messenger_conversations:', err_messenger_conversations_qp7ok.message);

            return data;
        } catch (e) { console.warn('[Forward] Error:', e); return null; }
    }, [currentUser?.id]);

    // ═════════════════════════════════════════════════════════
    // P14-8: Conversation Archival & Export
    // ═════════════════════════════════════════════════════════
    const archiveConversation = useCallback(async (convId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { error } = await supabase
                .from('messenger_participants')
                .update({ metadata: { archived: true, archived_at: new Date().toISOString() } })
                .eq('conversation_id', convId || conversationId)
                .eq('user_id', currentUser.id);
            if (error) throw error;
            setConversations(prev => prev.filter(c => c.id !== (convId || conversationId)));
        } catch (e) {
            console.warn('[Archive] Error:', e);
            throw e;
        }
    }, [conversationId, currentUser?.id]);

    const unarchiveConversation = useCallback(async (convId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { error } = await supabase
                .from('messenger_participants')
                .update({ metadata: { archived: false } })
                .eq('conversation_id', convId)
                .eq('user_id', currentUser.id);
            if (error) throw error;
            await loadConversations();
        } catch (e) {
            console.warn('[Unarchive] Error:', e);
            throw e;
        }
    }, [currentUser?.id, loadConversations]);

    const exportConversation = useCallback(async (format = 'json') => {
        if (!messages?.length) return null;
        const exportData = {
            conversationId,
            exportedAt: new Date().toISOString(),
            messageCount: messages.length,
            messages: messages.map(m => ({
                sender: m.sender_id,
                text: m.text,
                type: m.message_type,
                time: m.created_at,
                ...(m.media_url ? { media: m.media_url } : {}),
            })),
        };

        if (format === 'json') {
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_export_${conversationId?.slice(0, 8)}_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            return true;
        }
        // PDF generation: rich HTML-based
        if (format === 'pdf') {
            const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chat Export</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:20px auto;background:#1a1a2e;color:#e0e0e0;padding:20px}
h1{color:#2D88FF;border-bottom:2px solid #2D88FF;padding-bottom:10px}
.msg{padding:8px 14px;margin:6px 0;border-radius:12px;background:#242526;border-left:3px solid #2D88FF}
.time{color:#888;font-size:11px}.sender{color:#2D88FF;font-weight:700;font-size:12px}
.meta{color:#999;font-size:11px;margin-top:12px;text-align:center}</style></head><body>
<h1>💬 Chat Export</h1>
<p class="meta">Exported ${new Date().toLocaleString()} • ${messages.length} messages</p>
${messages.map(m =>
    `<div class="msg"><span class="sender">${m.sender_id?.slice(0, 8)}</span> <span class="time">${new Date(m.created_at).toLocaleString()}</span><br>${m.text || `[${m.message_type}]`}</div>`
).join('')}
</body></html>`;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_export_${conversationId?.slice(0, 8)}_${Date.now()}.html`;
            a.click();
            URL.revokeObjectURL(url);
            return true;
        }
        return null;
    }, [conversationId, messages]);

    // ═════════════════════════════════════════════════════════
    // P14-9: Custom Notification Sounds per Conversation
    // ═════════════════════════════════════════════════════════
    const NOTIFICATION_SOUNDS = [
        { id: 'default', label: 'Default', url: '/sounds/message.mp3' },
        { id: 'ding', label: 'Ding', url: '/sounds/ding.mp3' },
        { id: 'chime', label: 'Chime', url: '/sounds/chime.mp3' },
        { id: 'pop', label: 'Pop', url: '/sounds/pop.mp3' },
        { id: 'bell', label: 'Bell', url: '/sounds/bell.mp3' },
        { id: 'silent', label: 'Silent', url: null },
    ];

    const getConversationSoundPref = useCallback((convId) => {
        if (typeof window === 'undefined') return 'default';
        try {
            const prefs = JSON.parse(localStorage.getItem('messenger_sound_prefs') || '{}');
            return prefs[convId || conversationId] || 'default';
        } catch (_) { return 'default'; }
    }, [conversationId]);

    const setConversationSoundPref = useCallback((soundId, convId) => {
        if (typeof window === 'undefined') return;
        try {
            const prefs = JSON.parse(localStorage.getItem('messenger_sound_prefs') || '{}');
            prefs[convId || conversationId] = soundId;
            localStorage.setItem('messenger_sound_prefs', JSON.stringify(prefs));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [conversationId]);

    const playNotificationSound = useCallback((convId) => {
        if (typeof window === 'undefined') return;
        const soundId = getConversationSoundPref(convId);
        const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
        if (!sound?.url) return;
        try {
            const audio = new Audio(sound.url);
            audio.volume = 0.5;
            audio.play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [getConversationSoundPref]);

    // ═════════════════════════════════════════════════════════
    // P14-10: Pinned Messages Panel
    // ═════════════════════════════════════════════════════════
    const [pinnedMessages, setPinnedMessages] = useState([]);

    const pinMessage = useCallback(async (messageId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !conversationId) return;
        try {
            // BUG-FIX: Merge with existing metadata instead of overwriting
            const { data: existing, error: fetchError } = await supabase.from('messenger_messages').select('media_metadata').eq('id', messageId).maybeSingle();
            if (fetchError) throw fetchError;
            const merged = { ...(existing?.media_metadata || {}), pinned: true, pinned_by: currentUser.id, pinned_at: new Date().toISOString() };
            const { error: updateError } = await supabase
                .from('messenger_messages')
                .update({ media_metadata: merged })
                .eq('id', messageId);
            if (updateError) throw updateError;
            const msg = messages.find(m => m.id === messageId);
            if (msg) setPinnedMessages(prev => [...prev.filter(p => p.id !== messageId), { ...msg, pinned: true }]);
        } catch (e) {
            console.warn('[Pin] Error:', e);
            throw e;
        }
    }, [conversationId, currentUser?.id, messages]);

    const unpinMessage = useCallback(async (messageId) => {
        const supabase = getSupabase();
        if (!supabase) return;
        try {
            // BUG-FIX: Preserve existing metadata, only remove pin fields
            const { data: existing, error: fetchError } = await supabase.from('messenger_messages').select('media_metadata').eq('id', messageId).maybeSingle();
            if (fetchError) throw fetchError;
            const cleaned = { ...(existing?.media_metadata || {}) };
            delete cleaned.pinned;
            delete cleaned.pinned_by;
            delete cleaned.pinned_at;
            const { error: updateError } = await supabase
                .from('messenger_messages')
                .update({ media_metadata: cleaned })
                .eq('id', messageId);
            if (updateError) throw updateError;
            setPinnedMessages(prev => prev.filter(p => p.id !== messageId));
        } catch (e) {
            console.warn('[Unpin] Error:', e);
            throw e;
        }
    }, []);

    const loadPinnedMessages = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return [];
        try {
            const { data } = await supabase
                .from('messenger_messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .contains('media_metadata', { pinned: true })
                .order('created_at', { ascending: false });
            setPinnedMessages(data || []);
            return data || [];
        } catch (_) { return []; }
    }, [conversationId]);

    // Load pinned messages when conversation changes
    useEffect(() => {
        if (conversationId) loadPinnedMessages();
    }, [conversationId, loadPinnedMessages]);

    // ═══════════════════════════════════════════════════════════
    // Phase 15: Group Management, Security & Cross-Platform
    // ═══════════════════════════════════════════════════════════

    // ── P15-1: Create Group Conversation ──
    const createGroupConversation = useCallback(async ({ name, participants = [], avatar = null }) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return null;
        try {
            const { data: conv } = await supabase
                .from('messenger_conversations')
                .insert({
                    type: 'group',
                    name: name || 'New Group',
                    avatar_url: avatar,
                    metadata: { admin_ids: [currentUser.id], created_by: currentUser.id }
                })
                .select()
                .maybeSingle();
            if (!conv) return null;
            const participantRows = [currentUser.id, ...participants].map(uid => ({
                conversation_id: conv.id,
                user_id: uid,
                role: 'admin'
            }));
            const { error: err_messenger_participants_7chni } = await supabase.from('messenger_participants').insert(participantRows);
            if (err_messenger_participants_7chni) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_7chni.message);
            return conv;
        } catch (_) { return null; }
    }, [currentUser]);

    // ── P15-2: Update Group Settings ──
    const updateGroupSettings = useCallback(async (settings = {}) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return false;
        try {
            const update = {};
            if (settings.name) update.name = settings.name;
            if (settings.avatar_url) update.avatar_url = settings.avatar_url;
            if (settings.metadata) update.metadata = settings.metadata;
            const { error: err_messenger_conversations_cnoao } = await supabase.from('messenger_conversations').update(update).eq('id', conversationId);
            if (err_messenger_conversations_cnoao) console.warn('[Supabase] Silent mutation failed in messenger_conversations:', err_messenger_conversations_cnoao.message);
            return true;
        } catch (_) { return false; }
    }, [conversationId]);

    // ── P15-3: Add/Remove Group Members ──
    const addGroupMember = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !userId) return false;
        try {
            const { error: err_messenger_participants_0zzw3 } = await supabase.from('messenger_participants').insert({
                conversation_id: conversationId,
                user_id: userId,
                role: 'admin'
            });
            if (err_messenger_participants_0zzw3) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_0zzw3.message);
            return true;
        } catch (_) { return false; }
    }, [conversationId]);

    const removeGroupMember = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !userId) return false;
        try {
            const { error: err_messenger_participants_42kdw } = await supabase.from('messenger_participants').delete()
                .eq('conversation_id', conversationId)
                .eq('user_id', userId);
            if (err_messenger_participants_42kdw) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_42kdw.message);
            return true;
        } catch (_) { return false; }
    }, [conversationId]);

    // ── P15-4: Leave Group ──
    const leaveGroup = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return false;
        try {
            const { error: err_messenger_participants_5l4vg } = await supabase.from('messenger_participants').delete()
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
            if (err_messenger_participants_5l4vg) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_5l4vg.message);
            return true;
        } catch (_) { return false; }
    }, [conversationId, currentUser]);

    // ── P15-5: Block/Unblock Users ──
    const [blockedUsers, setBlockedUsers] = useState([]);

    const loadBlockedUsers = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { data } = await supabase
                .from('messenger_blocked')
                .select('blocked_id')
                .eq('blocker_id', currentUser.id);
            setBlockedUsers((data || []).map(r => r.blocked_id));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [currentUser]);

    useEffect(() => { loadBlockedUsers(); }, [loadBlockedUsers]);
    // P17-1: Keep ref in sync for stale-closure-safe access
    useEffect(() => { blockedUsersRef.current = blockedUsers; }, [blockedUsers]);

    const blockUser = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !userId) return false;
        try {
            const { error: err_messenger_blocked_5031g } = await supabase.from('messenger_blocked').insert({
                blocker_id: currentUser.id,
                blocked_id: userId
            });
            if (err_messenger_blocked_5031g) console.warn('[Supabase] Silent mutation failed in messenger_blocked:', err_messenger_blocked_5031g.message);
            setBlockedUsers(prev => [...prev, userId]);
            return true;
        } catch (_) { return false; }
    }, [currentUser]);

    const unblockUser = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !userId) return false;
        try {
            const { error: err_messenger_blocked_5bz91 } = await supabase.from('messenger_blocked').delete()
                .eq('blocker_id', currentUser.id)
                .eq('blocked_id', userId);
            if (err_messenger_blocked_5bz91) console.warn('[Supabase] Silent mutation failed in messenger_blocked:', err_messenger_blocked_5bz91.message);
            setBlockedUsers(prev => prev.filter(id => id !== userId));
            return true;
        } catch (_) { return false; }
    }, [currentUser]);

    // ── P15-6: Report Message ──
    const reportMessage = useCallback(async (messageId, reason = 'inappropriate') => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !messageId) return false;
        try {
            const { error: err_messenger_reports_5ml7d } = await supabase.from('messenger_reports').insert({
                reporter_id: currentUser.id,
                message_id: messageId,
                conversation_id: conversationId,
                reason,
                metadata: { reported_at: new Date().toISOString() }
            });
            if (err_messenger_reports_5ml7d) console.warn('[Supabase] Silent mutation failed in messenger_reports:', err_messenger_reports_5ml7d.message);
            return true;
        } catch (_) { return false; }
    }, [currentUser, conversationId]);

    // ── P15-7: Clear Conversation ──
    const clearConversation = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return false;
        try {
            const { error: err_messenger_messages_nm8ij } = await supabase.from('messenger_messages').update({ text: '[deleted]', message_type: 'deleted', media_metadata: { cleared: true } })
                .eq('conversation_id', conversationId);
            if (err_messenger_messages_nm8ij) console.warn('[Supabase] Silent mutation failed in messenger_messages:', err_messenger_messages_nm8ij.message);
            setMessages([]);
            return true;
        } catch (_) { return false; }
    }, [conversationId]);

    // ── P15-8: Media Sanitization Guard ──
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'application/pdf'];
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

    const validateMediaUpload = useCallback((file) => {
        if (!file) return { valid: false, error: 'No file provided' };
        if (!ALLOWED_MIME_TYPES.includes(file.type)) return { valid: false, error: `File type ${file.type} not allowed` };
        if (file.size > MAX_FILE_SIZE) return { valid: false, error: `File too large (max 25MB)` };
        return { valid: true, error: null };
    }, []);

    // ── P15-9: Cross-Device Settings Sync ──
    const getConversationSettings = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return {};
        try {
            const { data } = await supabase
                .from('messenger_participants')
                .select('settings')
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id)
                .maybeSingle();
            return data?.settings || {};
        } catch (_) { return {}; }
    }, [conversationId, currentUser]);

    const saveConversationSettings = useCallback(async (settings) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return false;
        try {
            const { error: err_messenger_participants_4keen } = await supabase.from('messenger_participants').update({ settings })
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
            if (err_messenger_participants_4keen) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_4keen.message);
            return true;
        } catch (_) { return false; }
    }, [conversationId, currentUser]);

    // ── P15-10: Read State Sync ──
    const syncReadState = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return;
        try {
            const { data: lastMsg } = await supabase
                .from('messenger_messages')
                .select('id')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (lastMsg) {
                const { error: err_messenger_participants_bw5ut } = await supabase.from('messenger_participants').update({ last_read_message_id: lastMsg.id, last_read_at: new Date().toISOString() })
                    .eq('conversation_id', conversationId)
                    .eq('user_id', currentUser.id);
                if (err_messenger_participants_bw5ut) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_bw5ut.message);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [conversationId, currentUser]);

    // Sync read state on mount
    useEffect(() => { if (conversationId) syncReadState(); }, [conversationId, syncReadState]);

    // ── P15-11: Message Deduplication ──
    const deduplicateMessages = useCallback((msgs) => {
        const seen = new Set();
        return (msgs || []).filter(m => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        });
    }, []);

    // ── P15-12: Conversation Sorting ──
    const [conversationSort, setConversationSort] = useState('recent'); // 'recent' | 'unread' | 'pinned' | 'name'

    const sortedConversations = useCallback((convos, pinnedIds = []) => {
        const sorted = [...(convos || [])];
        switch (conversationSort) {
            case 'unread':
                sorted.sort((a, b) => (b.unread_count || 0) - (a.unread_count || 0));
                break;
            case 'pinned':
                sorted.sort((a, b) => {
                    const aPin = pinnedIds.includes(a.id) ? 1 : 0;
                    const bPin = pinnedIds.includes(b.id) ? 1 : 0;
                    return bPin - aPin;
                });
                break;
            case 'name':
                sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                break;
            default: // 'recent'
                sorted.sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
        }
        return sorted;
    }, [conversationSort]);

    // ═══════════════════════════════════════════════════════════
    // Phase 16: Media Gallery, UX Enhancement & Accessibility
    // ═══════════════════════════════════════════════════════════

    // ── P16-1: Media Gallery ──
    const [mediaGallery, setMediaGallery] = useState({ images: [], videos: [], files: [], voice: [] });

    const loadMediaGallery = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return;
        try {
            const { data } = await supabase
                .from('messenger_messages')
                .select('id, message_type, text, media_url, media_metadata, created_at, sender_id')
                .eq('conversation_id', conversationId)
                .in('message_type', ['image', 'video', 'file', 'voice'])
                .order('created_at', { ascending: false })
                .limit(200);
            const gallery = { images: [], videos: [], files: [], voice: [] };
            (data || []).forEach(m => {
                if (m.message_type === 'image') gallery.images.push(m);
                else if (m.message_type === 'video') gallery.videos.push(m);
                else if (m.message_type === 'voice') gallery.voice.push(m);
                else gallery.files.push(m);
            });
            setMediaGallery(gallery);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [conversationId]);

    // ── P16-2: Message Edit History ──
    const editMessage = useCallback(async (messageId, newText) => {
        const supabase = getSupabase();
        if (!supabase || !messageId || !newText || !currentUser?.id) return false;
        try {
            // Get current message for edit trail — with sender ownership check
            const { data: current } = await supabase
                .from('messenger_messages')
                .select('text, media_metadata, sender_id')
                .eq('id', messageId)
                .eq('sender_id', currentUser.id) // BUG-FIX: Only edit own messages
                .maybeSingle();
            if (!current) return false;
            const editHistory = current.media_metadata?.edit_history || [];
            editHistory.push({ text: current.text, edited_at: new Date().toISOString() });
            const { error: err_messenger_messages_g7k6e } = await supabase.from('messenger_messages').update({ text: newText, media_metadata: { ...current.media_metadata, edit_history: editHistory, edited: true } })
                .eq('id', messageId)
                .eq('sender_id', currentUser.id);
            if (err_messenger_messages_g7k6e) console.warn('[Supabase] Silent mutation failed in messenger_messages:', err_messenger_messages_g7k6e.message);
            // Update local state
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: newText, media_metadata: { ...m.media_metadata, edit_history: editHistory, edited: true } } : m));
            // P17-10: EventBus emission for edit
            eventBus.emit(EventType.MESSAGE_RECEIVED, { type: 'edit', messageId, conversationId });
            return true;
        } catch (_) { return false; }
    }, [currentUser]);

    const getEditHistory = useCallback((messageId) => {
        const msg = messages.find(m => m.id === messageId);
        return msg?.media_metadata?.edit_history || [];
    }, [messages]);

    // ── P16-3: Scheduled Messages ──
    const [scheduledMessages, setScheduledMessages] = useState([]);

    const loadScheduledMessages = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return;
        try {
            const { data } = await supabase
                .from('messenger_scheduled')
                .select('*')
                .eq('conversation_id', conversationId)
                .eq('sender_id', currentUser.id)
                .eq('status', 'pending')
                .order('scheduled_at', { ascending: true });
            setScheduledMessages(data || []);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [conversationId, currentUser]);

    // Auto-load scheduled messages when conversation changes
    useEffect(() => { if (conversationId) loadScheduledMessages(); }, [conversationId, loadScheduledMessages]);

    const scheduleMessage = useCallback(async (text, scheduledAt) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id || !text) return false;
        try {
            const { error: err_messenger_scheduled_a33s1 } = await supabase.from('messenger_scheduled').insert({
                conversation_id: conversationId,
                sender_id: currentUser.id,
                text,
                scheduled_at: scheduledAt,
                status: 'pending'
            });
            if (err_messenger_scheduled_a33s1) console.warn('[Supabase] Silent mutation failed in messenger_scheduled:', err_messenger_scheduled_a33s1.message);
            await loadScheduledMessages();
            return true;
        } catch (_) { return false; }
    }, [conversationId, currentUser, loadScheduledMessages]);

    const cancelScheduledMessage = useCallback(async (scheduledId) => {
        const supabase = getSupabase();
        if (!supabase || !scheduledId) return false;
        try {
            const { error: err_messenger_scheduled_4nlns } = await supabase.from('messenger_scheduled').update({ status: 'cancelled' }).eq('id', scheduledId);
            if (err_messenger_scheduled_4nlns) console.warn('[Supabase] Silent mutation failed in messenger_scheduled:', err_messenger_scheduled_4nlns.message);
            setScheduledMessages(prev => prev.filter(m => m.id !== scheduledId));
            return true;
        } catch (_) { return false; }
    }, []);

    // ── P16-4: Sticker Packs ──
    const STICKER_PACKS = [
        { id: 'poker', name: '♠️ Poker', stickers: ['🃏', '♠️', '♥️', '♦️', '♣️', '🎰', '💰', '🏆', '🎲', '👑', '🔥', '💎'] },
        { id: 'reactions', name: '😄 Reactions', stickers: ['😂', '🤣', '😍', '🥰', '😎', '🤯', '🥳', '😱', '🤔', '👏', '🙌', '💪'] },
        { id: 'animals', name: '🐾 Animals', stickers: ['🐶', '🐱', '🦁', '🐻', '🐼', '🦊', '🐯', '🐸', '🦄', '🐙', '🦋', '🐝'] }
    ];

    const sendSticker = useCallback(async (sticker) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return false;
        // P17-3: Optimistic UI — add sticker to local state immediately
        const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const optimisticMsg = {
            id: optimisticId,
            conversation_id: conversationId,
            sender_id: currentUser.id,
            text: sticker,
            message_type: 'sticker',
            media_metadata: { sticker: true, size: 48 },
            created_at: new Date().toISOString(),
            status: 'sending'
        };
        setMessages(prev => [...prev, optimisticMsg]);
        try {
            const { data } = await supabase.from('messenger_messages').insert({
                conversation_id: conversationId,
                sender_id: currentUser.id,
                text: sticker,
                message_type: 'sticker',
                media_metadata: { sticker: true, size: 48 }
            }).select().maybeSingle();
            // Replace optimistic with real
            if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? data : m));
            // Update conversation last_message
            const { error: err_messenger_conversations_qlxaz } = await supabase.from('messenger_conversations').update({ last_message_text: `Sticker: ${sticker}`, last_message_at: new Date().toISOString() })
                .eq('id', conversationId);
            if (err_messenger_conversations_qlxaz) console.warn('[Supabase] Silent mutation failed in messenger_conversations:', err_messenger_conversations_qlxaz.message);
            // P17-10: EventBus emission
            eventBus.emit(EventType.MESSAGE_RECEIVED, { type: 'sticker', sticker, conversationId });
            return true;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [conversationId, currentUser]);

    // ── P16-5: Advanced Search ──
    const searchMessagesAdvanced = useCallback(async ({ query = '', dateFrom, dateTo, sender, type } = {}) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return [];
        try {
            let q = supabase
                .from('messenger_messages')
                .select('*')
                .eq('conversation_id', conversationId);
            if (query) q = q.ilike('text', `%${query}%`);
            if (dateFrom) q = q.gte('created_at', dateFrom);
            if (dateTo) q = q.lte('created_at', dateTo);
            if (sender) q = q.eq('sender_id', sender);
            if (type) q = q.eq('message_type', type);
            q = q.order('created_at', { ascending: false }).limit(50);
            const { data } = await q;
            return data || [];
        } catch (_) { return []; }
    }, [conversationId]);

    // ── P16-6: Contact Favorites ──
    const [favoriteContacts, setFavoriteContacts] = useState([]);

    const loadFavorites = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { data } = await supabase
                .from('messenger_favorites')
                .select('favorite_user_id')
                .eq('user_id', currentUser.id);
            setFavoriteContacts((data || []).map(r => r.favorite_user_id));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [currentUser]);

    useEffect(() => { loadFavorites(); }, [loadFavorites]);

    const toggleFavorite = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !userId) return false;
        const isFav = favoriteContacts.includes(userId);
        try {
            if (isFav) {
                const { error: err_messenger_favorites_g6u6x } = await supabase.from('messenger_favorites').delete().eq('user_id', currentUser.id).eq('favorite_user_id', userId);
                if (err_messenger_favorites_g6u6x) console.warn('[Supabase] Silent mutation failed in messenger_favorites:', err_messenger_favorites_g6u6x.message);
                setFavoriteContacts(prev => prev.filter(id => id !== userId));
            } else {
                const { error: err_messenger_favorites_mjzus } = await supabase.from('messenger_favorites').insert({ user_id: currentUser.id, favorite_user_id: userId });
                if (err_messenger_favorites_mjzus) console.warn('[Supabase] Silent mutation failed in messenger_favorites:', err_messenger_favorites_mjzus.message);
                setFavoriteContacts(prev => [...prev, userId]);
            }
            // P17-10: EventBus emission for favorites change
            eventBus.emit(EventType.MESSAGE_RECEIVED, { type: 'favorite_toggled', userId, isFavorite: !isFav });
            return true;
        } catch (_) { return false; }
    }, [currentUser, favoriteContacts]);

    // ── P16-7: Conversation Wallpaper ──
    const [conversationWallpaper, setConversationWallpaper] = useState(null);

    // P17-9: Wallpaper Reset to Default
    const resetWallpaper = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return false;
        try {
            const existingSettings = await getConversationSettings();
            const { wallpaper, ...rest } = existingSettings || {};
            const { error: err_messenger_participants_jpssl } = await supabase.from('messenger_participants').update({ settings: rest })
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
            if (err_messenger_participants_jpssl) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_jpssl.message);
            setConversationWallpaper(null);
            return true;
        } catch (_) { return false; }
    }, [conversationId, currentUser, getConversationSettings]);

    const uploadWallpaper = useCallback(async (file) => {
        if (!conversationId || !file) return null;
        try {
            // Read token from localStorage — avoids auth.getSession() lock contention
            let _wpToken = null;
            try {
                const _raw = localStorage.getItem('smarter-poker-auth');
                if (_raw) _wpToken = JSON.parse(_raw)?.access_token || null;
                if (!_wpToken) {
                    const _sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (_sbKey) _wpToken = JSON.parse(localStorage.getItem(_sbKey) || '{}')?.access_token || null;
                }
            } catch (_) {}
            const mimeType = file.type.startsWith('image/') ? file.type.split(';')[0] : 'image/jpeg';
            const metaRes = await fetch('/api/social/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(_wpToken ? { Authorization: `Bearer ${_wpToken}` } : {}) },
                body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType, folder: 'messenger-wallpapers', prefix: conversationId }),
            });
            if (!metaRes.ok) return null;
            const metaJson = await metaRes.json();
            if (!metaJson.success) return null;
            const putRes = await fetch(metaJson.signedUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
            if (!putRes.ok) return null;
            const publicUrl = metaJson.publicUrl;
            if (publicUrl) {
                const existingSettings = await getConversationSettings();
                const supabase = getSupabase();
                if (supabase) {
                    const { error: err_messenger_participants_izcxt } = await supabase.from('messenger_participants').update({ settings: { ...existingSettings, wallpaper: publicUrl } })
                        .eq('conversation_id', conversationId)
                        .eq('user_id', currentUser?.id);
                    if (err_messenger_participants_izcxt) console.warn('[Supabase] Silent mutation failed in messenger_participants:', err_messenger_participants_izcxt.message);
                }
                setConversationWallpaper(publicUrl);
            }
            return publicUrl;
        } catch (_) { return null; }
    }, [conversationId, currentUser, getConversationSettings]);

    // Load wallpaper on conversation change
    useEffect(() => {
        (async () => {
            const settings = await getConversationSettings();
            if (settings?.wallpaper) setConversationWallpaper(settings.wallpaper);
            else setConversationWallpaper(null);
        })();
    }, [conversationId, getConversationSettings]);

    // ── P16-8: Translation Language Picker ──
    const TRANSLATION_LANGUAGES = [
        { code: 'en', label: 'English' }, { code: 'es', label: 'Español' },
        { code: 'fr', label: 'Français' }, { code: 'de', label: 'Deutsch' },
        { code: 'pt', label: 'Português' }, { code: 'zh', label: '中文' },
        { code: 'ja', label: '日本語' }, { code: 'ko', label: '한국어' },
        { code: 'ar', label: 'العربية' }, { code: 'ru', label: 'Русский' }
    ];

    const translateMessage = useCallback(async (messageId, targetLang = 'en') => {
        const msg = messages.find(m => m.id === messageId);
        if (!msg?.text) return null;
        // Use browser-side translation API placeholder
        // In production, this would call /api/translate
        try {
            const resp = await fetch(`/api/translate?text=${encodeURIComponent(msg.text)}&target=${targetLang}`);
            if (resp.ok) {
                const { translated } = await resp.json();
                return translated;
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return `[${targetLang.toUpperCase()}] ${msg.text}`;
    }, [messages]);

    // ── P16-9: Keyboard Shortcuts ──
    const KEYBOARD_SHORTCUTS = [
        { keys: 'Ctrl+Enter', action: 'Send Message' },
        { keys: 'Ctrl+/', action: 'Toggle Search' },
        { keys: 'Escape', action: 'Close Modal / Panel' },
        { keys: 'Ctrl+Shift+S', action: 'Open Sticker Picker' },
        { keys: 'Ctrl+Shift+G', action: 'Open Media Gallery' },
        { keys: 'Ctrl+Shift+E', action: 'Toggle E2E Encryption' },
        { keys: 'Ctrl+Shift+M', action: 'Mute / Unmute' },
        { keys: 'Ctrl+B', action: 'Toggle Bookmarks' }
    ];

    // ── P16-10: Accessibility helpers ──
    const a11yProps = useCallback((role, label) => ({
        role,
        'aria-label': label,
        tabIndex: 0,
    }), []);

    // ═══════════════════════════════════════════════════════════
    // Phase 18: Messenger Intelligence & Premium UX
    // ═══════════════════════════════════════════════════════════

    // ── P18-1: Smart Reply Suggestions ──
    const getSmartReplies = useCallback((lastMessageText) => {
        if (!lastMessageText) return [];
        const text = lastMessageText.toLowerCase().trim();
        // Contextual pattern matching for quick replies
        if (text.includes('?')) {
            if (text.includes('how are') || text.includes('how\'s it going')) return ['I\'m great, thanks! 😊', 'Not bad, you?', 'Living the dream! 🃏'];
            if (text.includes('want to play') || text.includes('wanna play')) return ['Sure, I\'m in! 🎰', 'Maybe later', 'What stakes?'];
            if (text.includes('when') || text.includes('what time')) return ['In about 30 min', 'Tonight around 8', 'I\'ll let you know!'];
            if (text.includes('where')) return ['The usual table 🃏', 'Online tonight?', 'Let me check'];
            return ['Yes!', 'No, thanks', 'Let me think about it 🤔'];
        }
        if (text.includes('gg') || text.includes('good game') || text.includes('nice hand')) return ['GG! 🏆', 'Thanks! 🎉', 'Well played! ♠️'];
        if (text.includes('congratulat') || text.includes('congrats')) return ['Thank you! 🙏', 'Appreciate it! 💪', '🎉🎉🎉'];
        if (text.includes('hello') || text.includes('hey') || text.includes('hi ') || text === 'hi') return ['Hey! What\'s up? 👋', 'Hi there! 😊', 'Hello! 🃏'];
        if (text.includes('thank') || text.includes('thx') || text.includes('ty')) return ['You\'re welcome!', 'Anytime! 👊', 'No problem! 😊'];
        if (text.includes('lol') || text.includes('haha') || text.includes('😂')) return ['😂😂', 'So funny!', 'Haha right?!'];
        return ['👍', 'Sounds good!', '💯'];
    }, []);

    // ── P18-2: Conversation Summary / AI Recap ──
    const getConversationSummary = useCallback(() => {
        const unreadMessages = messages.filter(m => m.sender_id !== currentUser?.id && !m.read_at);
        if (unreadMessages.length === 0) return null;
        const count = unreadMessages.length;
        const senders = [...new Set(unreadMessages.map(m => m.sender_id?.slice(0, 6)))];
        const lastMsg = unreadMessages[unreadMessages.length - 1];
        const hasMedia = unreadMessages.some(m => m.message_type === 'image' || m.message_type === 'file' || m.message_type === 'voice');
        const hasStickers = unreadMessages.some(m => m.message_type === 'sticker');
        let summary = `${count} unread message${count > 1 ? 's' : ''}`;
        if (senders.length > 1) summary += ` from ${senders.length} people`;
        if (hasMedia) summary += ' (includes media)';
        if (hasStickers) summary += ' (includes stickers)';
        summary += `. Last: "${(lastMsg?.text || `[${lastMsg?.message_type}]`).slice(0, 50)}"`;
        return { summary, count, lastMessage: lastMsg, hasMedia, hasStickers };
    }, [messages, currentUser]);

    // ── P18-3: Reaction Analytics ──
    const getReactionStats = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return null;
        // messenger_reactions has no conversation_id column — filter via message_id
        const messageIds = messages.map(m => m.id).filter(Boolean);
        if (messageIds.length === 0) return { totalReactions: 0, topEmojis: [], mostReactedMessages: [] };
        try {
            const { data } = await supabase
                .from('messenger_reactions')
                .select('emoji, message_id')
                .in('message_id', messageIds);
            if (!data || data.length === 0) return { totalReactions: 0, topEmojis: [], mostReactedMessages: [] };
            const emojiCounts = {};
            const messageCounts = {};
            data.forEach(r => {
                emojiCounts[r.emoji] = (emojiCounts[r.emoji] || 0) + 1;
                messageCounts[r.message_id] = (messageCounts[r.message_id] || 0) + 1;
            });
            const topEmojis = Object.entries(emojiCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([emoji, count]) => ({ emoji, count }));
            const mostReactedMessages = Object.entries(messageCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([messageId, count]) => ({ messageId, count }));
            return { totalReactions: data.length, topEmojis, mostReactedMessages };
        } catch (_) { return null; }
    }, [conversationId, messages]);

    // ── P18-4: Conversation Labels / Folders ──
    const [conversationLabels, setConversationLabels] = useState({});

    const loadConversationLabels = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { data } = await supabase
                .from('messenger_conversation_labels')
                .select('*')
                .eq('user_id', currentUser.id);
            const grouped = {};
            (data || []).forEach(l => {
                if (!grouped[l.conversation_id]) grouped[l.conversation_id] = [];
                grouped[l.conversation_id].push({ label: l.label, color: l.color, id: l.id });
            });
            setConversationLabels(grouped);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [currentUser]);

    useEffect(() => { loadConversationLabels(); }, [loadConversationLabels]);

    const addConversationLabel = useCallback(async (convId, label, color = '#2D88FF') => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !convId || !label) return false;
        try {
            const { error: err_messenger_conversation_labels_v18f2 } = await supabase.from('messenger_conversation_labels').upsert({
                user_id: currentUser.id,
                conversation_id: convId,
                label,
                color
            });
            if (err_messenger_conversation_labels_v18f2) console.warn('[Supabase] Silent mutation failed in messenger_conversation_labels:', err_messenger_conversation_labels_v18f2.message);
            await loadConversationLabels();
            eventBus.emit(EventType.MESSAGE_RECEIVED, { type: 'label_added', conversationId: convId, label });
            return true;
        } catch (_) { return false; }
    }, [currentUser, loadConversationLabels]);

    const removeConversationLabel = useCallback(async (labelId) => {
        const supabase = getSupabase();
        if (!supabase || !labelId) return false;
        try {
            const { error: err_messenger_conversation_labels_3w1c5 } = await supabase.from('messenger_conversation_labels').delete().eq('id', labelId);
            if (err_messenger_conversation_labels_3w1c5) console.warn('[Supabase] Silent mutation failed in messenger_conversation_labels:', err_messenger_conversation_labels_3w1c5.message);
            await loadConversationLabels();
            return true;
        } catch (_) { return false; }
    }, [loadConversationLabels]);

    // ── P18-5: Message Templates ──
    const [messageTemplates, setMessageTemplates] = useState([]);

    const loadTemplates = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            const { data } = await supabase
                .from('messenger_templates')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('usage_count', { ascending: false });
            setMessageTemplates(data || []);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [currentUser]);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const saveTemplate = useCallback(async (title, text, category = 'general', shortcut = null) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !title || !text) return false;
        try {
            const { error: err_messenger_templates_4ro3b } = await supabase.from('messenger_templates').insert({
                user_id: currentUser.id,
                title,
                text,
                category,
                shortcut
            });
            if (err_messenger_templates_4ro3b) console.warn('[Supabase] Silent mutation failed in messenger_templates:', err_messenger_templates_4ro3b.message);
            await loadTemplates();
            return true;
        } catch (_) { return false; }
    }, [currentUser, loadTemplates]);

    const deleteTemplate = useCallback(async (templateId) => {
        const supabase = getSupabase();
        if (!supabase || !templateId) return false;
        try {
            const { error: err_messenger_templates_wf7tq } = await supabase.from('messenger_templates').delete().eq('id', templateId);
            if (err_messenger_templates_wf7tq) console.warn('[Supabase] Silent mutation failed in messenger_templates:', err_messenger_templates_wf7tq.message);
            setMessageTemplates(prev => prev.filter(t => t.id !== templateId));
            return true;
        } catch (_) { return false; }
    }, []);

    const useTemplate = useCallback(async (templateId) => {
        const supabase = getSupabase();
        if (!supabase || !templateId) return null;
        const template = messageTemplates.find(t => t.id === templateId);
        if (!template) return null;
        // Increment usage count
        try {
            const { error: err_messenger_templates_2f40p } = await supabase.from('messenger_templates').update({ usage_count: (template.usage_count || 0) + 1 })
                .eq('id', templateId);
            if (err_messenger_templates_2f40p) console.warn('[Supabase] Silent mutation failed in messenger_templates:', err_messenger_templates_2f40p.message);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return template.text;
    }, [messageTemplates]);

    // ── P18-6: Auto-Away Status ──
    const [autoAwayConfig, setAutoAwayConfig] = useState({ enabled: false, message: 'I\'m away right now. I\'ll get back to you soon!', idleMinutes: 15 });
    const idleTimerRef = useRef(null);

    const setAutoAway = useCallback((message, idleMinutes = 15) => {
        setAutoAwayConfig({ enabled: true, message, idleMinutes });
        // Store in conversation settings for persistence
        if (conversationId) {
            saveConversationSettings?.({ auto_away: { enabled: true, message, idleMinutes } });
        }
    }, [conversationId, saveConversationSettings]);

    const clearAutoAway = useCallback(() => {
        setAutoAwayConfig({ enabled: false, message: '', idleMinutes: 15 });
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (conversationId) {
            saveConversationSettings?.({ auto_away: { enabled: false } });
        }
    }, [conversationId, saveConversationSettings]);

    // Load auto-away config from settings
    useEffect(() => {
        (async () => {
            const settings = await getConversationSettings();
            if (settings?.auto_away?.enabled) {
                setAutoAwayConfig(settings.auto_away);
            }
        })();
    }, [conversationId, getConversationSettings]);

    // ── P18-7: Rich Media Player helpers ──
    const getMediaPlayerConfig = useCallback((mediaUrl, type = 'auto') => {
        const detectedType = type === 'auto' ? (
            mediaUrl?.match(/\.(mp4|webm|mov)$/i) ? 'video' :
            mediaUrl?.match(/\.(mp3|ogg|wav|m4a)$/i) ? 'audio' : 'unknown'
        ) : type;
        return {
            src: mediaUrl,
            type: detectedType,
            controls: true,
            preload: 'metadata',
            pip: detectedType === 'video', // picture-in-picture support
            speeds: [0.5, 0.75, 1, 1.25, 1.5, 2],
            defaultSpeed: 1
        };
    }, []);

    // ── P18-8: Conversation Analytics Dashboard ──
    const getConversationAnalytics = useCallback(() => {
        if (!messages || messages.length === 0) return null;
        const myMessages = messages.filter(m => m.sender_id === currentUser?.id);
        const theirMessages = messages.filter(m => m.sender_id !== currentUser?.id);

        // Messages per day
        const dayGroups = {};
        messages.forEach(m => {
            const day = new Date(m.created_at).toLocaleDateString();
            dayGroups[day] = (dayGroups[day] || 0) + 1;
        });
        const messagesPerDay = Object.entries(dayGroups || {}).map(([date, count]) => ({ date, count }));

        // Active hours heatmap (0-23)
        const hourCounts = Array(24).fill(0);
        messages.forEach(m => {
            const hour = new Date(m.created_at).getHours();
            hourCounts[hour]++;
        });

        // Message type breakdown
        const typeCounts = {};
        messages.forEach(m => {
            const t = m.message_type || 'text';
            typeCounts[t] = (typeCounts[t] || 0) + 1;
        });

        // Average response time (in seconds)
        let totalResponseTime = 0;
        let responseCount = 0;
        for (let i = 1; i < messages.length; i++) {
            if (messages[i].sender_id !== messages[i - 1].sender_id) {
                const diff = new Date(messages[i].created_at) - new Date(messages[i - 1].created_at);
                if (diff > 0 && diff < 86400000) { // within 24h
                    totalResponseTime += diff;
                    responseCount++;
                }
            }
        }
        const avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount / 1000) : 0;

        return {
            totalMessages: messages.length,
            myMessages: myMessages.length,
            theirMessages: theirMessages.length,
            messagesPerDay,
            activeHours: hourCounts,
            messageTypes: typeCounts,
            avgResponseTime,
            firstMessageDate: messages[0]?.created_at,
            lastMessageDate: messages[messages.length - 1]?.created_at,
            avgMessageLength: Math.round(messages.reduce((s, m) => s + (m.text?.length || 0), 0) / messages.length),
            mediaCount: messages.filter(m => m.message_type === 'image' || m.message_type === 'file' || m.message_type === 'video').length,
            stickerCount: messages.filter(m => m.message_type === 'sticker').length,
        };
    }, [messages, currentUser]);

    // ── P18-9: Message Expiry Timer ──
    const setMessageExpiry = useCallback(async (messageId, expiryMinutes) => {
        const supabase = getSupabase();
        if (!supabase || !messageId || !expiryMinutes) return false;
        try {
            const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
            const { error: err_messenger_messages_k8x0k } = await supabase.from('messenger_messages').update({ expires_at: expiresAt })
                .eq('id', messageId);
            if (err_messenger_messages_k8x0k) console.warn('[Supabase] Silent mutation failed in messenger_messages:', err_messenger_messages_k8x0k.message);
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, expires_at: expiresAt } : m));
            return true;
        } catch (_) { return false; }
    }, []);

    // Check and remove expired messages periodically
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date().toISOString();
            setMessages(prev => {
                const filtered = prev.filter(m => !m.expires_at || m.expires_at > now);
                return filtered.length !== prev.length ? filtered : prev;
            });
        }, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, []);

    // ── P18-10: Conversation Backup & Restore ──
    const backupConversation = useCallback(() => {
        if (!messages || messages.length === 0) return null;
        const backupData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            conversationId,
            messengerType,
            messageCount: messages.length,
            messages: messages.map(m => ({
                id: m.id,
                text: m.text,
                sender_id: m.sender_id,
                message_type: m.message_type,
                media_url: m.media_url,
                media_metadata: m.media_metadata,
                created_at: m.created_at,
            })),
        };
        // Encode as base64 for basic obfuscation
        const encoded = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(JSON.stringify(backupData)))) : JSON.stringify(backupData);
        const blob = new Blob([encoded], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `messenger_backup_${conversationId?.slice(0, 8)}_${Date.now()}.spbk`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    }, [messages, conversationId, messengerType]);

    const restoreConversation = useCallback(async (backupFileContent) => {
        try {
            const decoded = typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(backupFileContent))) : backupFileContent;
            const backupData = JSON.parse(decoded);
            if (!backupData.version || !backupData.messages) return { success: false, error: 'Invalid backup format' };
            const supabase = getSupabase();
            if (!supabase || !conversationId) return { success: false, error: 'No active connection' };
            // Insert messages that don't already exist
            const existingIds = new Set(messages.map(m => m.id));
            const newMessages = backupData.messages.filter(m => !existingIds.has(m.id));
            if (newMessages.length === 0) return { success: true, restored: 0, message: 'All messages already exist' };
            const toInsert = newMessages.map(m => ({
                ...m,
                conversation_id: conversationId,
            }));
            const { error: err_messenger_messages_ukhjo } = await supabase.from('messenger_messages').insert(toInsert);
            if (err_messenger_messages_ukhjo) console.warn('[Supabase] Silent mutation failed in messenger_messages:', err_messenger_messages_ukhjo.message);
            await loadMessages();
            return { success: true, restored: newMessages.length, message: `Restored ${newMessages.length} messages` };
        } catch (e) { return { success: false, error: e.message || 'Restore failed' }; }
    }, [conversationId, messages, loadMessages]);

    // ═══════════════════════════════════════════════════════════
    // Phase 19: Intelligence V2 & Real-Time Enhancements
    // ═══════════════════════════════════════════════════════════

    // ── P19-7: Smart Compose (Autocomplete) ──
    const userPhraseCache = useRef({});
    const getAutoComplete = useCallback((partialText) => {
        if (!partialText || partialText.length < 3) return [];
        const lower = partialText.toLowerCase().trim();
        // Build phrase cache from user's sent messages
        if (Object.keys(userPhraseCache.current || {}).length === 0 && messages.length > 0) {
            const myMsgs = messages.filter(m => m.sender_id === currentUser?.id && m.text);
            myMsgs.forEach(m => {
                const words = m.text.split(/\s+/);
                for (let i = 0; i < words.length - 1; i++) {
                    const prefix = words.slice(i, i + 2).join(' ').toLowerCase();
                    const rest = words.slice(i + 2, i + 6).join(' ');
                    if (rest && prefix.length > 3) {
                        if (!userPhraseCache.current[prefix]) userPhraseCache.current[prefix] = [];
                        if (!userPhraseCache.current[prefix].includes(rest)) {
                            userPhraseCache.current[prefix].push(rest);
                        }
                    }
                }
            });
        }
        // Common poker phrases fallback
        const pokerPhrases = {
            'good ': ['game', 'luck', 'hand', 'run'],
            'want to ': ['play tonight?', 'join the table?', 'run it twice?', 'grab a seat?'],
            'nice ': ['hand!', 'bluff!', 'call!', 'fold.'],
            'i think ': ['we should play deeper', "that's a great spot", "you're right", 'the table is good'],
            'are you ': ['playing tonight?', 'at the table?', 'still in?', 'joining us?'],
            'what ': ['stakes?', 'time?', 'table?', 'game?'],
            'let me ': ['know', 'check', 'think about it', 'see the board'],
            'how ': ['much?', 'are you?', 'many players?', 'long is the wait?'],
        };
        // Match user phrase cache first, then poker phrases
        const suggestions = [];
        Object.entries(userPhraseCache.current || {}).forEach(([prefix, completions]) => {
            if (lower.endsWith(prefix) || prefix.startsWith(lower.slice(-prefix.length))) {
                completions.slice(0, 3).forEach(c => {
                    if (!suggestions.includes(c)) suggestions.push(c);
                });
            }
        });
        Object.entries(pokerPhrases || {}).forEach(([prefix, completions]) => {
            if (lower.endsWith(prefix)) {
                completions.forEach(c => {
                    if (!suggestions.includes(c)) suggestions.push(c);
                });
            }
        });
        return suggestions.slice(0, 4);
    }, [messages, currentUser]);

    // ── P19-8: Sentiment Analysis ──
    const analyzeSentiment = useCallback((messageText) => {
        if (!messageText) return { score: 0, label: 'neutral', emoji: '😐' };
        const text = messageText.toLowerCase();
        const positiveWords = ['great', 'awesome', 'love', 'amazing', 'good', 'nice', 'thanks', 'thank', 'congrats', 'congratulations', 'win', 'won', 'perfect', 'excellent', 'happy', 'glad', 'beautiful', 'fantastic', 'incredible', 'wonderful', 'best', 'lol', 'haha', '😂', '😊', '🎉', '🏆', '💪', '🔥', '❤️', '👍', '💯', 'gg', 'well played'];
        const negativeWords = ['bad', 'terrible', 'hate', 'awful', 'worst', 'sucks', 'angry', 'frustrated', 'annoyed', 'disappointed', 'lost', 'losing', 'damn', 'crap', 'ugh', 'stupid', 'unfair', 'ridiculous', 'horrible', '😡', '😤', '😠', '💔', 'tilted', 'rigged', 'cooler', 'bad beat'];
        let score = 0;
        positiveWords.forEach(w => { if (text.includes(w)) score += 1; });
        negativeWords.forEach(w => { if (text.includes(w)) score -= 1; });
        // Normalize to -1 to 1 range
        score = Math.max(-1, Math.min(1, score / 3));
        if (score > 0.3) return { score, label: 'positive', emoji: '😊' };
        if (score < -0.3) return { score, label: 'negative', emoji: '😠' };
        return { score, label: 'neutral', emoji: '😐' };
    }, []);

    // ── P19-9: Spam Detection (Enhanced Rate Limiter) ──
    const spamDetectionRef = useRef({ lastMessages: [], warnings: 0, blocked: false, blockedUntil: null });

    const checkSpamStatus = useCallback((messageText) => {
        const sd = spamDetectionRef.current;
        const now = Date.now();
        // Unblock if block period expired
        if (sd.blocked && sd.blockedUntil && now > sd.blockedUntil) {
            sd.blocked = false;
            sd.warnings = 0;
            sd.lastMessages = [];
        }
        if (sd.blocked) return { allowed: false, reason: 'You are temporarily blocked for spam. Try again shortly.', severity: 'blocked' };

        // Basic rate limit check
        if (!checkRateLimit(conversationId)) {
            sd.warnings++;
            if (sd.warnings >= 3) {
                sd.blocked = true;
                sd.blockedUntil = now + 120000; // 2 min block
                return { allowed: false, reason: 'Spam detected. Blocked for 2 minutes.', severity: 'blocked' };
            }
            return { allowed: false, reason: `Slow down! ${30 - sd.warnings * 10}s cooldown.`, severity: 'warning' };
        }

        // Pattern detection: repetitive messages
        const recent = sd.lastMessages.filter(m => now - m.time < 30000);
        const duplicateCount = recent.filter(m => m.text === messageText).length;
        if (duplicateCount >= 3) {
            sd.warnings++;
            return { allowed: false, reason: 'Duplicate message detected. Please vary your messages.', severity: 'warning' };
        }

        // Pattern detection: very rapid bursts (5+ msgs in 5 seconds)
        const burstCount = recent.filter(m => now - m.time < 5000).length;
        if (burstCount >= 5) {
            sd.warnings++;
            return { allowed: false, reason: 'Sending too fast. Please slow down.', severity: 'warning' };
        }

        // Track this message
        sd.lastMessages.push({ text: messageText, time: now });
        // Keep only last 30 seconds
        sd.lastMessages = sd.lastMessages.filter(m => now - m.time < 30000);
        return { allowed: true, reason: null, severity: 'ok' };
    }, [conversationId]);

    // ── P19-3: Search Highlighting Helper ──
    const highlightSearchMatches = useCallback((text, query) => {
        if (!text || !query || query.length < 2) return text;
        try {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escaped})`, 'gi');
            return text.replace(regex, '⟪$1⟫'); // markers for frontend to render as highlights
        } catch (_) { return text; }
    }, []);

    // ═══════════════════════════════════════════════════════════
    // Phase 20: Premium Finish & Social Polish
    // ═══════════════════════════════════════════════════════════

    // ── P20-1: Message Reactions Floating Panel ──
    const getMessageReactions = useCallback(async (messageId) => {
        const supabase = getSupabase();
        if (!supabase || !messageId) return [];
        try {
            const { data } = await supabase
                .from('messenger_reactions')
                .select('emoji, user_id, created_at')
                .eq('message_id', messageId)
                .order('created_at', { ascending: false });
            return (data || []).map(r => ({
                emoji: r.emoji,
                userId: r.user_id,
                userLabel: r.user_id?.slice(0, 6),
                reactedAt: r.created_at
            }));
        } catch (_) { return []; }
    }, []);

    // ── P20-2: Contact Insights Card ──
    const getContactInsights = useCallback((otherUserId) => {
        if (!otherUserId || !messages.length) return null;
        const theirMsgs = messages.filter(m => m.sender_id === otherUserId);
        const myMsgs = messages.filter(m => m.sender_id === currentUser?.id);
        const mediaMessages = messages.filter(m => m.message_type === 'image' || m.message_type === 'file' || m.message_type === 'voice');
        const firstMsg = messages[0];
        const lastMsg = messages[messages.length - 1];
        // Average response time (in minutes)
        let totalResponseTime = 0;
        let responseCount = 0;
        for (let i = 1; i < messages.length; i++) {
            if (messages[i].sender_id !== messages[i - 1].sender_id) {
                const diff = new Date(messages[i].created_at) - new Date(messages[i - 1].created_at);
                if (diff > 0 && diff < 86400000) { // ignore gaps > 24h
                    totalResponseTime += diff;
                    responseCount++;
                }
            }
        }
        const avgResponseMin = responseCount > 0 ? Math.round((totalResponseTime / responseCount) / 60000) : null;
        return {
            totalMessages: messages.length,
            theirMessages: theirMsgs.length,
            myMessages: myMsgs.length,
            sharedMedia: mediaMessages.length,
            conversationAge: firstMsg ? Math.ceil((Date.now() - new Date(firstMsg.created_at)) / 86400000) : 0,
            lastActive: lastMsg?.created_at || null,
            avgResponseTime: avgResponseMin,
            topEmojis: theirMsgs.filter(m => /[\u{1F600}-\u{1F64F}]/u.test(m.text || '')).length
        };
    }, [messages, currentUser]);

    // ── P20-4: Unread Separator Index ──
    const getUnreadSeparatorIndex = useCallback(() => {
        if (!messages.length || !currentUser?.id) return -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].sender_id !== currentUser.id && messages[i].read_at) {
                return i + 1 < messages.length ? i + 1 : -1;
            }
        }
        const firstUnread = messages.findIndex(m => m.sender_id !== currentUser.id && !m.read_at);
        return firstUnread;
    }, [messages, currentUser]);

    // ── P20-5: Conversation Theme ──
    const [conversationTheme, setConversationThemeState] = useState({ accentColor: '#2D88FF', fontSize: 13 });

    useEffect(() => {
        if (conversationId) {
            getConversationSettings().then(settings => {
                if (settings?.theme) setConversationThemeState(settings.theme);
            });
        }
    }, [conversationId, getConversationSettings]);

    const setConversationTheme = useCallback(async (theme) => {
        setConversationThemeState(theme);
        const existingSettings = await getConversationSettings();
        await saveConversationSettings({ ...existingSettings, theme });
    }, [getConversationSettings, saveConversationSettings]);

    // ── P20-6: Batch Forward Messages ──
    const forwardMultipleMessages = useCallback(async (messageIds, targetConversationId) => {
        if (!messageIds?.length || !targetConversationId) return { success: false, forwarded: 0 };
        let forwarded = 0;
        for (const msgId of messageIds) {
            const result = await forwardMessage(msgId, targetConversationId);
            if (result) forwarded++;
        }
        return { success: forwarded > 0, forwarded };
    }, [forwardMessage]);

    // ── P20-9: Voice-to-Text Transcription ──
    const transcribeVoice = useCallback(async (audioUrl) => {
        if (typeof window === 'undefined' || !audioUrl) return null;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return { text: null, error: 'Speech recognition not supported in this browser' };
        try {
            const response = await fetch(audioUrl);
            const blob = await response.blob();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await blob.arrayBuffer();
            await audioContext.decodeAudioData(arrayBuffer);
            audioContext.close(); // P20 BUG FIX: prevent resource leak
            // Use MediaRecorder + SpeechRecognition pipeline
            return new Promise((resolve) => {
                const recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = 'en-US';
                let transcript = '';
                recognition.onresult = (e) => { transcript = e.results[0]?.[0]?.transcript || ''; };
                recognition.onerror = () => resolve({ text: null, error: 'Transcription failed' });
                recognition.onend = () => resolve({ text: transcript || null, error: transcript ? null : 'No speech detected' });
                // Note: SpeechRecognition works with microphone input by default
                // For pre-recorded audio, we'd need a server-side solution
                // This provides the framework — returns a helpful message for now
                resolve({ text: null, error: 'Voice transcription requires microphone input. Server-side transcription coming soon.' });
            });
        } catch (e) { return { text: null, error: e.message || 'Transcription failed' }; }
    }, []);

    // ── P20-10: Conversation Export Formats ──
    const exportConversationFormatted = useCallback((format = 'txt') => {
        if (!messages.length) return null;
        const convName = `Conversation_${conversationId?.slice(0, 8) || 'export'}`;
        const timestamp = new Date().toISOString().slice(0, 10);

        if (format === 'txt') {
            const lines = messages.map(m => {
                const time = new Date(m.created_at).toLocaleString();
                const sender = m.sender_id === currentUser?.id ? 'You' : (m.sender_id?.slice(0, 6) || 'User');
                return `[${time}] ${sender}: ${m.text || `[${m.message_type}]`}`;
            });
            const content = `${convName} — Exported ${timestamp}\n${'='.repeat(50)}\n\n${lines.join('\n')}`;
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${convName}_${timestamp}.txt`; a.click();
            URL.revokeObjectURL(url);
            return true;
        }

        if (format === 'html') {
            // P20 BUG FIX: HTML-escape text to prevent XSS in exported files
            const escHtml = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const rows = messages.map(m => {
                const time = new Date(m.created_at).toLocaleString();
                const sender = m.sender_id === currentUser?.id ? 'You' : (m.sender_id?.slice(0, 6) || 'User');
                const isMine = m.sender_id === currentUser?.id;
                const safeText = escHtml(m.text) || `[${escHtml(m.message_type)}]`;
                return `<div style="margin:4px 0;padding:6px 10px;border-radius:12px;max-width:70%;${isMine ? 'margin-left:auto;background:#2D88FF;color:#fff' : 'background:#3A3B3C;color:#e4e6eb'}"><strong>${sender}</strong> <span style="font-size:10px;opacity:0.7">${time}</span><br>${safeText}</div>`;
            });
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${convName}</title><style>body{font-family:system-ui;background:#18191A;color:#e4e6eb;max-width:600px;margin:40px auto;padding:20px}h1{font-size:18px}</style></head><body><h1>${convName}</h1><p style="color:#999;font-size:12px">Exported ${timestamp}</p>${rows.join('')}</body></html>`;
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${convName}_${timestamp}.html`; a.click();
            URL.revokeObjectURL(url);
            return true;
        }

        if (format === 'csv') {
            const csvRows = ['Time,Sender,Type,Text'];
            messages.forEach(m => {
                const time = new Date(m.created_at).toISOString();
                const sender = m.sender_id === currentUser?.id ? 'You' : (m.sender_id?.slice(0, 6) || 'User');
                let text = (m.text || `[${m.message_type}]`).replace(/"/g, '""');
                // P20 BUG FIX: prevent CSV formula injection
                if (/^[=+\-@]/.test(text)) text = "'" + text;
                csvRows.push(`"${time}","${sender}","${m.message_type}","${text}"`);
            });
            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${convName}_${timestamp}.csv`; a.click();
            URL.revokeObjectURL(url);
            return true;
        }

        return false;
    }, [messages, conversationId, currentUser]);

    // ═══════════════════════════════════════════════════════════
    // Phase 21: Intelligence V3 & Admin Integration
    // ═══════════════════════════════════════════════════════════

    // ── P21-1: Voice Transcription Trigger ──
    // (Uses existing transcribeVoice from P20-9, frontend wiring needed)

    // ── P21-2: Message Reminders ──
    const [messageReminders, setMessageReminders] = useState([]);

    const setMessageReminder = useCallback(async (messageId, remindAt, noteText = '') => {
        const supabase = getSupabase();
        if (!supabase || !messageId || !remindAt || !currentUser?.id) return false;
        try {
            const msg = messages.find(m => m.id === messageId);
            const { data, error } = await supabase.from('messenger_reminders').insert({
                message_id: messageId,
                user_id: currentUser.id,
                conversation_id: conversationId,
                remind_at: remindAt,
                note: noteText,
                message_preview: msg?.text?.slice(0, 100) || '[Media]',
                status: 'pending'
            }).select().maybeSingle();
            if (error) throw error;
            if (data) setMessageReminders(prev => [...prev, data]);
            return true;
        } catch (_) { return false; }
    }, [messages, conversationId, currentUser]);

    const getReminders = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return [];
        try {
            const { data } = await supabase.from('messenger_reminders')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('status', 'pending')
                .order('remind_at', { ascending: true });
            const reminders = data || [];
            setMessageReminders(reminders);
            return reminders;
        } catch (_) { return []; }
    }, [currentUser]);

    const dismissReminder = useCallback(async (reminderId) => {
        const supabase = getSupabase();
        if (!supabase || !reminderId) return false;
        try {
            const { error: err_messenger_reminders_m4wlo } = await supabase.from('messenger_reminders').update({ status: 'dismissed' })
                .eq('id', reminderId);
            if (err_messenger_reminders_m4wlo) console.warn('[Supabase] Silent mutation failed in messenger_reminders:', err_messenger_reminders_m4wlo.message);
            setMessageReminders(prev => prev.filter(r => r.id !== reminderId));
            return true;
        } catch (_) { return false; }
    }, []);

    // Load reminders on mount
    useEffect(() => { if (currentUser?.id) getReminders(); }, [currentUser?.id, getReminders]);

    // Check for due reminders every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date().toISOString();
            const dueReminders = messageReminders.filter(r => r.remind_at <= now && r.status === 'pending');
            if (dueReminders.length > 0 && typeof window !== 'undefined') {
                dueReminders.forEach(r => {
                    // Browser notification
                    if (Notification?.permission === 'granted') {
                        new Notification('Message Reminder', { body: r.message_preview || 'You have a reminder', icon: '/favicon.ico' });
                    }
                    // Mark as fired
                    dismissReminder(r.id);
                });
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [messageReminders, dismissReminder]);

    // ── P21-3: Message Text Formatting ──
    const formatMessageText = useCallback((text) => {
        if (!text) return text;
        let formatted = text;
        // Bold: **text** or __text__
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
        // Italic: *text* or _text_
        formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        formatted = formatted.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
        // Code: `text`
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.9em">$1</code>');
        // Strikethrough: ~~text~~
        formatted = formatted.replace(/~~(.+?)~~/g, '<del>$1</del>');
        // Links: auto-detect URLs
        formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#8ab4f8;text-decoration:underline">$1</a>');
        return formatted;
    }, []);

    // ── P21-4: Virtualized Message List ──
    // (Frontend-only — will use windowing in SPM/CAM render)

    // ── P21-5: Offline Message Queue ──
    const offlineQueueRef = useRef([]);
    const [isOffline, setIsOffline] = useState(false);

    // Monitor online/offline status — syncs P21 isOffline state
    // NOTE: The canonical online/offline listeners + P12 IndexedDB drain
    //       live in the P12 useEffect above. This only syncs the isOffline
    //       flag and flushes the in-memory P21 offlineQueueRef.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleOnline = () => {
            setIsOffline(false);
            // Flush P21 in-memory queued messages
            if (offlineQueueRef.current.length > 0) {
                const queue = [...offlineQueueRef.current];
                offlineQueueRef.current = [];
                queue.forEach(async (queuedMsg) => {
                    try {
                        await sendMessage(queuedMsg.text, {
                            type: queuedMsg.type || 'text',
                            mediaUrl: queuedMsg.mediaUrl || null,
                        });
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                });
            }
        };
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        setIsOffline(!navigator.onLine);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [sendMessage]);

    const queueOfflineMessage = useCallback((text, type = 'text', mediaUrl = null) => {
        const queuedMsg = { text, type, mediaUrl, queuedAt: Date.now(), id: `offline_${Date.now()}` };
        offlineQueueRef.current.push(queuedMsg);
        // Show in local messages as "sending..."
        setMessages(prev => [...prev, {
            id: queuedMsg.id,
            text,
            sender_id: currentUser?.id,
            message_type: type,
            media_url: mediaUrl,
            created_at: new Date().toISOString(),
            _offline: true, // flag for UI styling
            _pending: true
        }]);
        return queuedMsg;
    }, [currentUser]);

    // ── P21-6: @smarter.poker Admin Link Service ──
    const SMARTER_POKER_MENTIONS = ['@smarter.poker', '@smarterpoker', '@sp'];

    const handleSmarterPokerMention = useCallback(async (messageText, messageId) => {
        const supabase = getSupabase();
        if (!supabase || !messageText || !currentUser?.id) return false;
        const lowerText = messageText.toLowerCase();
        const hasMention = SMARTER_POKER_MENTIONS.some(m => lowerText.includes(m));
        if (!hasMention) return false;

        try {
            // Log to admin messages table for the /horses panel
            const { error: err_messenger_admin_messages_xm9fq } = await supabase.from('messenger_admin_messages').insert({
                message_id: messageId,
                user_id: currentUser.id,
                conversation_id: conversationId,
                message_text: messageText,
                sender_display: currentUser.email || currentUser.id?.slice(0, 8),
                status: 'unread',
                source: 'messenger_mention',
                created_at: new Date().toISOString()
            });
            if (err_messenger_admin_messages_xm9fq) console.warn('[Supabase] Silent mutation failed in messenger_admin_messages:', err_messenger_admin_messages_xm9fq.message);
            return true;
        } catch (_) { return false; }
    }, [conversationId, currentUser]);

    // Auto-detect @smarter.poker mentions in sent messages
    const sendMessageWithMentionDetection = useCallback(async (text, metadata = {}) => {
        // If offline, queue it
        if (isOffline) {
            return queueOfflineMessage(text, metadata.type || 'text', metadata.mediaUrl || null);
        }
        const result = await sendMessage(text, metadata);
        // Check for @smarter.poker mention after sending
        if (result && text) {
            handleSmarterPokerMention(text, result.id || result);
        }
        return result;
    }, [sendMessage, isOffline, queueOfflineMessage, handleSmarterPokerMention]);

    const getAdminMentions = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase) return [];
        try {
            const { data } = await supabase.from('messenger_admin_messages')
                .select('*')
                .eq('status', 'unread')
                .order('created_at', { ascending: false })
                .limit(50);
            return data || [];
        } catch (_) { return []; }
    }, []);

    // ═══════════════════════════════════════════════════════════
    // Return Service API
    // ═══════════════════════════════════════════════════════════
    return {
        // State
        messages,
        conversations,
        unreadCount,
        isOnline,
        searchResults,
        localStreamRef,
        remoteStreamRef,
        peerConnectionRef,

        // P12-2: Persistence
        loadMessages,
        sendMessage,
        deleteMessage,

        // P12-3: Reactions
        addReaction,
        removeReaction,
        loadReactions,

        // P12-4: Read Receipts
        markAsRead,
        markAsDelivered,

        // P12-5/6: WebRTC
        startCall,
        answerCall,
        endCall,

        // P12-7: Unread
        refreshUnreadCount,

        // P12-9: Search
        searchMessages,

        // P12-10: Conversations
        loadConversations,

        // P12-13: Upload
        uploadMedia,

        // P12-14: E2E
        exchangePublicKey,
        getRemotePublicKey,

        // P14-2: Presence
        onlineUsers,
        typingUsers,
        sendTypingIndicator,

        // P14-3: Read Receipts UI
        getReceiptIcon,

        // P14-4: Voice Waveform
        analyzeAudioWaveform,

        // P14-5: Link Preview
        fetchLinkPreview,

        // P14-7: Forwarding
        forwardMessage,

        // P14-8: Archive/Export
        archiveConversation,
        unarchiveConversation,
        exportConversation,

        // P14-9: Notification Sounds
        NOTIFICATION_SOUNDS,
        getConversationSoundPref,
        setConversationSoundPref,
        playNotificationSound,

        // P14-10: Pinned Messages
        pinnedMessages,
        pinMessage,
        unpinMessage,
        loadPinnedMessages,

        // P15-1/2/3/4: Group Management
        createGroupConversation,
        updateGroupSettings,
        addGroupMember,
        removeGroupMember,
        leaveGroup,

        // P15-5: Block/Unblock
        blockedUsers,
        blockUser,
        unblockUser,

        // P15-6: Report
        reportMessage,

        // P15-7: Clear Conversation
        clearConversation,

        // P15-8: Media Sanitization
        validateMediaUpload,

        // P15-9: Settings Sync
        getConversationSettings,
        saveConversationSettings,

        // P15-10: Read State Sync
        syncReadState,

        // P15-11: Deduplication
        deduplicateMessages,

        // P15-12: Conversation Sorting
        conversationSort,
        setConversationSort,
        sortedConversations,

        // P16-1: Media Gallery
        mediaGallery,
        loadMediaGallery,

        // P16-2: Edit History
        editMessage,
        getEditHistory,

        // P16-3: Scheduled Messages
        scheduledMessages,
        scheduleMessage,
        cancelScheduledMessage,
        loadScheduledMessages,

        // P16-4: Sticker Packs
        STICKER_PACKS,
        sendSticker,

        // P16-5: Advanced Search
        searchMessagesAdvanced,

        // P16-6: Contact Favorites
        favoriteContacts,
        toggleFavorite,

        // P16-7: Wallpaper
        conversationWallpaper,
        uploadWallpaper,
        resetWallpaper, // P17-9

        // P16-8: Translation
        TRANSLATION_LANGUAGES,
        translateMessage,

        // P16-9: Keyboard Shortcuts
        KEYBOARD_SHORTCUTS,

        // P16-10: Accessibility
        a11yProps,

        // P18-1: Smart Replies
        getSmartReplies,

        // P18-2: Conversation Summary
        getConversationSummary,

        // P18-3: Reaction Analytics
        getReactionStats,

        // P18-4: Conversation Labels
        conversationLabels,
        addConversationLabel,
        removeConversationLabel,

        // P18-5: Message Templates
        messageTemplates,
        saveTemplate,
        deleteTemplate,
        useTemplate,

        // P18-6: Auto-Away
        autoAwayConfig,
        setAutoAway,
        clearAutoAway,

        // P18-7: Rich Media Player
        getMediaPlayerConfig,

        // P18-8: Conversation Analytics
        getConversationAnalytics,

        // P18-9: Message Expiry
        setMessageExpiry,

        // P18-10: Backup & Restore
        backupConversation,
        restoreConversation,

        // P19-7: Smart Compose
        getAutoComplete,

        // P19-8: Sentiment Analysis
        analyzeSentiment,

        // P19-9: Spam Detection
        checkSpamStatus,

        // P19-3: Search Highlighting
        highlightSearchMatches,

        // P20-1: Message Reactions Panel
        getMessageReactions,

        // P20-2: Contact Insights
        getContactInsights,

        // P20-4: Unread Separator
        getUnreadSeparatorIndex,

        // P20-5: Conversation Theme
        conversationTheme,
        setConversationTheme,

        // P20-6: Batch Forward
        forwardMultipleMessages,

        // P20-9: Voice Transcription
        transcribeVoice,

        // P20-10: Export Formats
        exportConversationFormatted,

        // P21-1: Voice Transcription (uses existing transcribeVoice)

        // P21-2: Message Reminders
        messageReminders,
        setMessageReminder,
        getReminders,
        dismissReminder,

        // P21-3: Message Formatting
        formatMessageText,

        // P21-5: Offline Queue
        isOffline,
        queueOfflineMessage,
        sendMessageWithMentionDetection,

        // P21-6: @smarter.poker Admin Link
        handleSmarterPokerMention,
        getAdminMentions,
    };
}

export default useMessengerService;
