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

            if (error) { console.error('[Messenger] Load messages error:', error); return []; }
            setMessages(prev => page === 1 ? (data || []) : [...(data || []), ...prev]);
            return data || [];
        } catch (e) { console.error('[Messenger] Load error:', e); return []; }
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
            await supabase
                .from('messenger_conversations')
                .update({
                    last_message_text: (text || msgPayload.message_type).slice(0, 100),
                    last_message_at: new Date().toISOString()
                })
                .eq('id', conversationId);

            // P12-8: Trigger push notification
            triggerPushNotification(conversationId, currentUser, text);

            return data;
        } catch (e) {
            console.error('[Messenger] Send error:', e);
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
                setMessages(prev => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
                setUnreadCount(prev => prev + 1);
                
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
            await supabase.from('messenger_reactions').upsert({
                message_id: messageId,
                user_id: currentUser.id,
                reaction_type: type,
                emoji: type === 'emoji' ? emoji : null,
                gif_url: type === 'gif' ? gifUrl : null,
            }, { onConflict: 'message_id,user_id,emoji' });
        } catch (e) { console.error('[Reaction] Add error:', e); }
    }, [currentUser?.id]);

    const removeReaction = useCallback(async (messageId, emoji) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            await supabase.from('messenger_reactions')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', currentUser.id)
                .eq('emoji', emoji);
        } catch (e) { console.error('[Reaction] Remove error:', e); }
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
            await supabase
                .from('messenger_messages')
                .update({ status: 'read', updated_at: new Date().toISOString() })
                .in('id', messageIds)
                .neq('sender_id', currentUser.id)
                .eq('conversation_id', conversationId);

            // Reset unread count for this participant
            await supabase
                .from('messenger_participants')
                .update({ unread_count: 0, last_read_at: new Date().toISOString() })
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);

            setUnreadCount(0);
        } catch (e) { console.error('[ReadReceipt] Update error:', e); }
    }, [conversationId, currentUser?.id]);

    const markAsDelivered = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return;
        try {
            await supabase
                .from('messenger_messages')
                .update({ status: 'delivered' })
                .eq('conversation_id', conversationId)
                .eq('status', 'sent')
                .neq('sender_id', currentUser.id);
        } catch (e) { console.error('[ReadReceipt] Delivery update error:', e); }
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
                    await supabase.from('messenger_call_signals').insert({
                        conversation_id: conversationId,
                        caller_id: currentUser.id,
                        callee_id: calleeId,
                        call_type: callType,
                        signal_type: 'ice_candidate',
                        signal_data: { candidate: event.candidate.toJSON() },
                        status: 'active',
                    });
                }
            };

            // Create and send offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await supabase.from('messenger_call_signals').insert({
                conversation_id: conversationId,
                caller_id: currentUser.id,
                callee_id: calleeId,
                call_type: callType,
                signal_type: 'offer',
                signal_data: { sdp: offer.sdp, type: offer.type },
                status: 'pending',
            });

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
            console.error('[WebRTC] Start call error:', e);
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
                    await supabase.from('messenger_call_signals').insert({
                        conversation_id: conversationId,
                        caller_id: currentUser.id,
                        callee_id: callerId,
                        call_type: callType,
                        signal_type: 'ice_candidate',
                        signal_data: { candidate: event.candidate.toJSON() },
                        status: 'active',
                    });
                }
            };

            // Set remote offer
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));

            // Create and send answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await supabase.from('messenger_call_signals').insert({
                conversation_id: conversationId,
                caller_id: currentUser.id,
                callee_id: callerId,
                call_type: callType,
                signal_type: 'answer',
                signal_data: { sdp: answer.sdp, type: answer.type },
                status: 'active',
            });

            return { localStream: stream, remoteStream: remoteStreamRef.current, pc };
        } catch (e) {
            console.error('[WebRTC] Answer call error:', e);
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
                await supabase.from('messenger_call_signals').insert({
                    conversation_id: conversationId,
                    caller_id: currentUser.id,
                    callee_id: currentUser.id, // Self-hangup signal
                    call_type: 'audio',
                    signal_type: 'hangup',
                    signal_data: {},
                    status: 'ended',
                });
            } catch (_) {}
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
        } catch (_) { /* Non-critical */ }
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

            // Merge participant info
            const merged = (convData || []).map(conv => {
                const participant = participantData.find(p => p.conversation_id === conv.id);
                return {
                    ...conv,
                    isPinned: participant?.is_pinned || false,
                    unreadCount: participant?.unread_count || 0,
                    myRole: participant?.role || 'member',
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
            console.error('[Messenger] Load conversations error:', e);
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
            await supabase
                .from('messenger_messages')
                .update({ is_deleted: true, text: null, media_url: null, updated_at: new Date().toISOString() })
                .eq('id', messageId)
                .eq('sender_id', currentUser.id);
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true, text: null } : m));
        } catch (e) { console.error('[Messenger] Delete error:', e); }
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
            console.error('[Upload] Failed:', e);
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
            await supabase
                .from('messenger_participants')
                .update({
                    metadata: { public_key: publicKeyJwk }
                })
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
        } catch (e) { console.error('[E2E] Key exchange error:', e); }
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
            drainOfflineQueue(async (msg) => {
                const supabase = getSupabase();
                if (!supabase) return;
                await supabase.from('messenger_messages').insert(msg);
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
                Object.keys(state).forEach(uid => { online[uid] = true; });
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
            await supabase
                .from('messenger_conversations')
                .update({ last_message_text: `Forwarded: ${(original.text || original.message_type).slice(0, 80)}`, last_message_at: new Date().toISOString() })
                .eq('id', targetConversationId);

            return data;
        } catch (e) { console.error('[Forward] Error:', e); return null; }
    }, [currentUser?.id]);

    // ═════════════════════════════════════════════════════════
    // P14-8: Conversation Archival & Export
    // ═════════════════════════════════════════════════════════
    const archiveConversation = useCallback(async (convId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            await supabase
                .from('messenger_participants')
                .update({ metadata: { archived: true, archived_at: new Date().toISOString() } })
                .eq('conversation_id', convId || conversationId)
                .eq('user_id', currentUser.id);
            setConversations(prev => prev.filter(c => c.id !== (convId || conversationId)));
        } catch (e) { console.error('[Archive] Error:', e); }
    }, [conversationId, currentUser?.id]);

    const unarchiveConversation = useCallback(async (convId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id) return;
        try {
            await supabase
                .from('messenger_participants')
                .update({ metadata: { archived: false } })
                .eq('conversation_id', convId)
                .eq('user_id', currentUser.id);
            await loadConversations();
        } catch (e) { console.error('[Unarchive] Error:', e); }
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
        // PDF generation: simple text-based
        if (format === 'pdf') {
            const content = messages.map(m =>
                `[${new Date(m.created_at).toLocaleString()}] ${m.sender_id?.slice(0, 8)}: ${m.text || `[${m.message_type}]`}`
            ).join('\n');
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_export_${conversationId?.slice(0, 8)}_${Date.now()}.txt`;
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
        } catch (_) {}
    }, [conversationId]);

    const playNotificationSound = useCallback((convId) => {
        if (typeof window === 'undefined') return;
        const soundId = getConversationSoundPref(convId);
        const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
        if (!sound?.url) return;
        try {
            const audio = new Audio(sound.url);
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (_) {}
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
            const { data: existing } = await supabase.from('messenger_messages').select('media_metadata').eq('id', messageId).maybeSingle();
            const merged = { ...(existing?.media_metadata || {}), pinned: true, pinned_by: currentUser.id, pinned_at: new Date().toISOString() };
            await supabase
                .from('messenger_messages')
                .update({ media_metadata: merged })
                .eq('id', messageId);
            const msg = messages.find(m => m.id === messageId);
            if (msg) setPinnedMessages(prev => [...prev.filter(p => p.id !== messageId), { ...msg, pinned: true }]);
        } catch (e) { console.error('[Pin] Error:', e); }
    }, [conversationId, currentUser?.id, messages]);

    const unpinMessage = useCallback(async (messageId) => {
        const supabase = getSupabase();
        if (!supabase) return;
        try {
            // BUG-FIX: Preserve existing metadata, only remove pin fields
            const { data: existing } = await supabase.from('messenger_messages').select('media_metadata').eq('id', messageId).maybeSingle();
            const cleaned = { ...(existing?.media_metadata || {}) };
            delete cleaned.pinned;
            delete cleaned.pinned_by;
            delete cleaned.pinned_at;
            await supabase
                .from('messenger_messages')
                .update({ media_metadata: cleaned })
                .eq('id', messageId);
            setPinnedMessages(prev => prev.filter(p => p.id !== messageId));
        } catch (e) { console.error('[Unpin] Error:', e); }
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
                role: uid === currentUser.id ? 'admin' : 'member'
            }));
            await supabase.from('messenger_participants').insert(participantRows);
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
            await supabase.from('messenger_conversations').update(update).eq('id', conversationId);
            return true;
        } catch (_) { return false; }
    }, [conversationId]);

    // ── P15-3: Add/Remove Group Members ──
    const addGroupMember = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !userId) return false;
        try {
            await supabase.from('messenger_participants').insert({
                conversation_id: conversationId,
                user_id: userId,
                role: 'member'
            });
            return true;
        } catch (_) { return false; }
    }, [conversationId]);

    const removeGroupMember = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !userId) return false;
        try {
            await supabase.from('messenger_participants')
                .delete()
                .eq('conversation_id', conversationId)
                .eq('user_id', userId);
            return true;
        } catch (_) { return false; }
    }, [conversationId]);

    // ── P15-4: Leave Group ──
    const leaveGroup = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id) return false;
        try {
            await supabase.from('messenger_participants')
                .delete()
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
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
        } catch (_) {}
    }, [currentUser]);

    useEffect(() => { loadBlockedUsers(); }, [loadBlockedUsers]);

    const blockUser = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !userId) return false;
        try {
            await supabase.from('messenger_blocked').insert({
                blocker_id: currentUser.id,
                blocked_id: userId
            });
            setBlockedUsers(prev => [...prev, userId]);
            return true;
        } catch (_) { return false; }
    }, [currentUser]);

    const unblockUser = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !userId) return false;
        try {
            await supabase.from('messenger_blocked')
                .delete()
                .eq('blocker_id', currentUser.id)
                .eq('blocked_id', userId);
            setBlockedUsers(prev => prev.filter(id => id !== userId));
            return true;
        } catch (_) { return false; }
    }, [currentUser]);

    // ── P15-6: Report Message ──
    const reportMessage = useCallback(async (messageId, reason = 'inappropriate') => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !messageId) return false;
        try {
            await supabase.from('messenger_reports').insert({
                reporter_id: currentUser.id,
                message_id: messageId,
                conversation_id: conversationId,
                reason,
                metadata: { reported_at: new Date().toISOString() }
            });
            return true;
        } catch (_) { return false; }
    }, [currentUser, conversationId]);

    // ── P15-7: Clear Conversation ──
    const clearConversation = useCallback(async () => {
        const supabase = getSupabase();
        if (!supabase || !conversationId) return false;
        try {
            await supabase.from('messenger_messages')
                .update({ text: '[deleted]', message_type: 'deleted', media_metadata: { cleared: true } })
                .eq('conversation_id', conversationId);
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
            await supabase.from('messenger_participants')
                .update({ settings })
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id);
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
                await supabase.from('messenger_participants')
                    .update({ last_read_message_id: lastMsg.id, last_read_at: new Date().toISOString() })
                    .eq('conversation_id', conversationId)
                    .eq('user_id', currentUser.id);
            }
        } catch (_) {}
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
        } catch (_) {}
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
            await supabase.from('messenger_messages')
                .update({ text: newText, media_metadata: { ...current.media_metadata, edit_history: editHistory, edited: true } })
                .eq('id', messageId)
                .eq('sender_id', currentUser.id);
            // Update local state
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: newText, media_metadata: { ...m.media_metadata, edit_history: editHistory, edited: true } } : m));
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
        } catch (_) {}
    }, [conversationId, currentUser]);

    const scheduleMessage = useCallback(async (text, scheduledAt) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !currentUser?.id || !text) return false;
        try {
            await supabase.from('messenger_scheduled').insert({
                conversation_id: conversationId,
                sender_id: currentUser.id,
                text,
                scheduled_at: scheduledAt,
                status: 'pending'
            });
            await loadScheduledMessages();
            return true;
        } catch (_) { return false; }
    }, [conversationId, currentUser, loadScheduledMessages]);

    const cancelScheduledMessage = useCallback(async (scheduledId) => {
        const supabase = getSupabase();
        if (!supabase || !scheduledId) return false;
        try {
            await supabase.from('messenger_scheduled').update({ status: 'cancelled' }).eq('id', scheduledId);
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
        try {
            await supabase.from('messenger_messages').insert({
                conversation_id: conversationId,
                sender_id: currentUser.id,
                text: sticker,
                message_type: 'sticker',
                media_metadata: { sticker: true, size: 48 }
            });
            // BUG-FIX: Update conversation last_message to reflect sticker
            await supabase.from('messenger_conversations')
                .update({ last_message_text: `Sticker: ${sticker}`, last_message_at: new Date().toISOString() })
                .eq('id', conversationId);
            return true;
        } catch (_) { return false; }
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
        } catch (_) {}
    }, [currentUser]);

    useEffect(() => { loadFavorites(); }, [loadFavorites]);

    const toggleFavorite = useCallback(async (userId) => {
        const supabase = getSupabase();
        if (!supabase || !currentUser?.id || !userId) return false;
        const isFav = favoriteContacts.includes(userId);
        try {
            if (isFav) {
                await supabase.from('messenger_favorites').delete().eq('user_id', currentUser.id).eq('favorite_user_id', userId);
                setFavoriteContacts(prev => prev.filter(id => id !== userId));
            } else {
                await supabase.from('messenger_favorites').insert({ user_id: currentUser.id, favorite_user_id: userId });
                setFavoriteContacts(prev => [...prev, userId]);
            }
            return true;
        } catch (_) { return false; }
    }, [currentUser, favoriteContacts]);

    // ── P16-7: Conversation Wallpaper ──
    const [conversationWallpaper, setConversationWallpaper] = useState(null);

    const uploadWallpaper = useCallback(async (file) => {
        const supabase = getSupabase();
        if (!supabase || !conversationId || !file) return null;
        try {
            const fileName = `wallpapers/${conversationId}/${Date.now()}_${file.name}`;
            const { error } = await supabase.storage.from('messenger-media').upload(fileName, file);
            if (error) return null;
            const { data: urlData } = supabase.storage.from('messenger-media').getPublicUrl(fileName);
            const publicUrl = urlData?.publicUrl;
            if (publicUrl) {
                // BUG-FIX: Merge wallpaper into existing settings instead of overwriting
                const existingSettings = await getConversationSettings();
                await supabase.from('messenger_participants')
                    .update({ settings: { ...existingSettings, wallpaper: publicUrl } })
                    .eq('conversation_id', conversationId)
                    .eq('user_id', currentUser?.id);
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
        } catch (_) {}
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

        // P16-8: Translation
        TRANSLATION_LANGUAGES,
        translateMessage,

        // P16-9: Keyboard Shortcuts
        KEYBOARD_SHORTCUTS,

        // P16-10: Accessibility
        a11yProps,
    };
}

export default useMessengerService;
