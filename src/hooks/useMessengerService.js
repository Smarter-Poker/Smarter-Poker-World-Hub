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
// P12-6: STUN/TURN Config
// ═══════════════════════════════════════════════════════════════
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
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
    };
}

export default useMessengerService;
