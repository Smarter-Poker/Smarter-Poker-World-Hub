/**
 * APP-WIDE MESSENGER CALLS (2026-10-31).
 *
 * Calls used to live entirely inside pages/hub/messenger.js, which meant:
 *   - a call only rang if the other person happened to be on /hub/messenger;
 *   - hanging up removed the user's own incoming-call listener (see
 *     src/lib/calls/callSignal.js), so after one call nobody could reach them;
 *   - the 30 second auto-decline captured a stale `incomingCall` of null and
 *     never fired, and the caller had no timeout at all - unanswered calls
 *     rang forever while the caller sat alone in an empty room;
 *   - hang-up notified whichever conversation was open, not the person on the
 *     call, so a call answered from a push could not be ended for the caller;
 *   - both sides wrote a call receipt, so most calls left two.
 *
 * This provider is mounted once in pages/_app.js and owns the whole lifecycle.
 * Any surface starts a call with useCall().startCall(...) (or requestCall()
 * outside React context): the Messenger header, a missed-call "Call Back", and
 * the floating chat windows.
 *
 * Receipts: exactly one per call, written by the CALLER, who always knows the
 * conversation - completed (with duration), missed, declined or cancelled.
 */
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { getAuthUser, getAccessToken, authedFetch, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/authUtils';
import { toast } from '../../stores/toastStore';
import { createRingTone } from '../../utils/ringTone';
import {
    startCallSignal, stopCallSignal, onCallSignal, sendCallSignal, sendToOwnDevices, beaconCallSignal,
} from '../../lib/calls/callSignal';
import {
    makeCallRoomName, parseCallRoomConversation, callReceiptContent, normalizeCallType, isConversationId,
    CALL_RING_TIMEOUT_MS,
} from '../../lib/calls/callRoom.mjs';
import IncomingCallScreen from './IncomingCallScreen';

const CallScreen = dynamic(() => import('./CallScreen'), { ssr: false, loading: () => null });

const CallContext = createContext(null);

// A failure in the call overlay must never take the page down with it.
class CallOverlayBoundary extends Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) {
        console.warn('[CallProvider] call screen failed:', error?.message || error);
        this.props.onFailure?.();
    }
    componentDidUpdate(previous) { if (previous.callId !== this.props.callId && this.state.failed) this.setState({ failed: false }); }
    render() { return this.state.failed ? null : this.props.children; }
}
let registeredStart = null;

/** Start a call from anywhere (no React context needed). */
export function requestCall(options) {
    if (registeredStart) return registeredStart(options);
    toast.error('Calling Is Still Loading. Please Try Again In A Moment.');
    return Promise.resolve(false);
}

export function useCall() {
    return useContext(CallContext) || { startCall: requestCall, activeCall: null };
}

function uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); }));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function publicName(user) {
    return user?.display_name || user?.username || user?.user_metadata?.username || user?.user_metadata?.poker_alias || 'Player';
}

async function postJson(path, body, extra = {}) {
    const response = await authedFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...extra,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.success !== false, status: response.status, data };
}

export default function CallProvider({ children }) {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [call, setCallState] = useState(null);
    const callRef = useRef(null);
    const userRef = useRef(null);
    const finished = useRef(new Set());
    const ringTimer = useRef(null);
    const reachTimer = useRef(null);
    const outgoingTone = useRef(null);
    const incomingAudio = useRef(null);
    const vibrateTimer = useRef(null);
    const lastPendingCheck = useRef(0);

    const setCall = useCallback(next => {
        const value = typeof next === 'function' ? next(callRef.current) : next;
        const wasActive = Boolean(callRef.current);
        callRef.current = value;
        setCallState(value);
        // ServiceWorkerUpdater defers an update reload while this is set, and
        // reloads on sp-call-idle, so a new build never drops a call.
        if (typeof window !== 'undefined') {
            window.__spCallActive = Boolean(value);
            if (wasActive && !value) window.dispatchEvent(new Event('sp-call-idle'));
        }
    }, []);

    // ── Identity ────────────────────────────────────────────────────────────
    useEffect(() => {
        const accept = next => {
            const id = next?.id || null;
            if ((userRef.current?.id || null) === id) { if (next) userRef.current = { ...userRef.current, ...next }; return; }
            userRef.current = next || null;
            setUser(next || null);
        };
        accept(getAuthUser());
        let subscription = null;
        try {
            const { data } = supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') accept(null);
                else if (session?.user) accept(session.user);
            });
            subscription = data?.subscription;
        } catch (error) { console.warn('[CallProvider] auth listener unavailable:', error?.message || error); }
        return () => subscription?.unsubscribe?.();
    }, []);

    // ── Sounds ──────────────────────────────────────────────────────────────
    const stopRinging = useCallback(() => {
        if (outgoingTone.current) { outgoingTone.current.stop(); outgoingTone.current = null; }
        if (incomingAudio.current) {
            try { incomingAudio.current.pause(); incomingAudio.current.currentTime = 0; } catch { /* not loaded */ }
        }
        if (vibrateTimer.current) { clearInterval(vibrateTimer.current); vibrateTimer.current = null; }
        try { navigator.vibrate?.(0); } catch { /* unsupported */ }
    }, []);

    const startIncomingRing = useCallback(() => {
        try {
            if (!incomingAudio.current) {
                incomingAudio.current = new Audio('/sounds/ringtone.mp3');
                incomingAudio.current.loop = true;
            }
            incomingAudio.current.currentTime = 0;
            incomingAudio.current.play().catch(() => { /* autoplay blocked: the screen still rings visually */ });
        } catch { /* audio unavailable */ }
        try {
            if (navigator.vibrate) {
                navigator.vibrate([600, 400, 600]);
                vibrateTimer.current = setInterval(() => navigator.vibrate?.([600, 400, 600]), 2200);
            }
        } catch { /* unsupported */ }
    }, []);

    const clearRingTimer = useCallback(() => {
        if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
        if (reachTimer.current) { clearTimeout(reachTimer.current); reachTimer.current = null; }
    }, []);

    // ── Server side effects ─────────────────────────────────────────────────
    const cancelPending = useCallback(c => {
        const self = userRef.current?.id;
        if (!c || !self) return;
        const callerId = c.role === 'caller' ? self : c.peer.id;
        const calleeId = c.role === 'caller' ? c.peer.id : self;
        postJson('/api/calls/cancel', { callerId, calleeId, roomName: c.id }).catch(() => {});
    }, []);

    const writeReceipt = useCallback((c, status) => {
        if (!c || c.role !== 'caller' || !isConversationId(c.conversationId)) return;
        const durationSeconds = status === 'completed' && c.answeredAt ? (Date.now() - c.answeredAt) / 1000 : 0;
        postJson('/api/messenger/send-message', {
            conversationId: c.conversationId,
            requestId: uuid(),
            content: callReceiptContent({ callType: c.callType, status, durationSeconds }),
        }).then(result => {
            if (!result.ok) console.warn('[CallProvider] call receipt was not saved:', result.data?.error || result.status);
        }).catch(error => console.warn('[CallProvider] call receipt failed:', error?.message || error));
    }, []);

    /**
     * End a call exactly once.
     *   notifyPeer - tell the other side (call_ended)
     *   unanswered - receipt status for a caller whose call was never answered
     *   message    - toast to show
     */
    const finish = useCallback((c, { notifyPeer = false, unanswered = 'cancelled', message = null, missedNotice = false } = {}) => {
        if (!c || finished.current.has(c.id)) return;
        finished.current.add(c.id);
        if (finished.current.size > 50) finished.current.delete(finished.current.values().next().value);
        clearRingTimer();
        stopRinging();
        if (notifyPeer) void sendCallSignal(supabase, c.peer.id, 'call_ended', { roomName: c.id, enderId: userRef.current?.id });
        if (c.role === 'caller') {
            writeReceipt(c, c.answeredAt ? 'completed' : unanswered);
            if (!c.answeredAt && (missedNotice || (unanswered === 'cancelled' && !c.creating))) {
                postJson('/api/messenger/insert-missed-call-notification', { calleeId: c.peer.id, callType: c.callType, reason: 'missed' }).catch(() => {});
            }
        }
        cancelPending(c);
        if (callRef.current?.id === c.id) setCall(null);
        if (message) toast.info(message);
    }, [cancelPending, clearRingTimer, setCall, stopRinging, writeReceipt]);

    // ── Start a call ────────────────────────────────────────────────────────
    const startCall = useCallback(async ({ conversationId, otherUser, callType, isRequest = false, isGroup = false } = {}) => {
        const self = userRef.current;
        const type = normalizeCallType(callType);
        if (!self?.id) { toast.error('Sign In To Make Calls'); return false; }
        if (callRef.current) { toast.info('You Are Already On A Call'); return false; }
        if (!otherUser?.id) { toast.error('Cannot Start Call - User Not Found'); return false; }
        if (otherUser.id === self.id) { toast.error('Cannot Call Yourself'); return false; }
        if (isGroup) { toast.error('Calls Are Only Available In 1-on-1 Conversations'); return false; }
        if (isRequest) { toast.error('Accept The Message Request Before Calling'); return false; }
        if (!isConversationId(conversationId)) { toast.error('Open The Conversation To Call'); return false; }

        const roomName = makeCallRoomName(conversationId);
        const peer = { id: otherUser.id, name: otherUser.display_name || otherUser.username || 'Player', avatar: otherUser.avatar_url || null };
        const c = { id: roomName, role: 'caller', phase: 'outgoing', creating: true, callType: type, conversationId: conversationId.toLowerCase(), peer, selfId: self.id, answeredAt: null };
        setCall(c);
        // Started inside the tap, so the browser lets the ring tone play.
        outgoingTone.current = createRingTone();
        outgoingTone.current?.start();

        const created = await postJson('/api/calls/create', {
            calleeId: peer.id, conversationId: c.conversationId, roomName, callType: type,
            callerName: publicName(self), callerAvatar: self.avatar_url || self.user_metadata?.avatar_url || null,
        }).catch(() => ({ ok: false, data: {} }));
        if (callRef.current?.id !== roomName) { cancelPending(c); return false; } // hung up while starting
        if (!created.ok) {
            finished.current.add(roomName);
            clearRingTimer();
            stopRinging();
            setCall(null);
            toast.error(created.data?.error || 'Could Not Start The Call. Please Try Again.');
            return false;
        }

        // Tell the caller whether this call can actually reach anyone. On
        // 2026-10-27 two calls to a player with notifications off and no
        // Smarter.Poker tab open rang nowhere, while the caller's screen gave
        // no sign of it. Now: "Ringing..." once their app confirms the call,
        // "Ringing Their Phone..." when the push was delivered, and "Not
        // Reachable Right Now" when neither happened.
        const pushDelivered = !!created.data?.push?.sent;
        setCall(previous => (previous?.id === roomName ? { ...previous, creating: false, reach: pushDelivered ? 'push' : 'calling' } : previous));
        reachTimer.current = setTimeout(() => {
            const current = callRef.current;
            if (current?.id !== roomName || current.phase !== 'outgoing' || current.reach === 'ringing') return;
            if (current.reach === 'push') return;
            setCall({ ...current, reach: 'unreachable' });
        }, 7000);
        void sendCallSignal(supabase, peer.id, 'incoming_call', {
            roomName, conversationId: c.conversationId, callType: type,
            callerId: self.id, callerName: publicName(self), callerAvatar: self.avatar_url || self.user_metadata?.avatar_url || null,
        });
        if (ringTimer.current) clearTimeout(ringTimer.current);
        ringTimer.current = setTimeout(() => {
            const current = callRef.current;
            if (current?.id === roomName && current.phase === 'outgoing') finish(current, { notifyPeer: true, unanswered: 'missed', missedNotice: true, message: 'No Answer' });
        }, CALL_RING_TIMEOUT_MS);
        return true;
    }, [cancelPending, clearRingTimer, finish, setCall, stopRinging]);

    useEffect(() => {
        registeredStart = startCall;
        return () => { if (registeredStart === startCall) registeredStart = null; };
    }, [startCall]);

    // ── Incoming ────────────────────────────────────────────────────────────
    const ringFor = useCallback(details => {
        const roomName = details.roomName;
        if (!roomName || finished.current.has(roomName)) return;
        const current = callRef.current;
        let autoAnswer = false;
        if (current && current.id !== roomName && current.role === 'caller' && current.phase === 'outgoing' && current.peer.id === details.callerId) {
            // Both called each other at once. The lower user id keeps its call;
            // the other side drops its own and answers that one.
            const self = userRef.current?.id || '';
            if (self < details.callerId) return;
            finished.current.add(current.id);
            clearRingTimer();
            stopRinging();
            cancelPending(current);
            callRef.current = null;
            autoAnswer = true;
        } else if (current) {
            if (current.id !== roomName) void sendCallSignal(supabase, details.callerId, 'call_declined', { roomName, reason: 'busy', declinerId: userRef.current?.id });
            return;
        }
        const c = {
            id: roomName, role: 'callee', phase: 'incoming', callType: normalizeCallType(details.callType),
            conversationId: details.conversationId || parseCallRoomConversation(roomName),
            peer: { id: details.callerId, name: details.callerName || 'Someone', avatar: details.callerAvatar || null },
            selfId: userRef.current?.id, pendingCallId: details.pendingCallId || null, answeredAt: null,
        };
        setCall(c);
        if (autoAnswer) { acceptRef.current?.(); return; }
        startIncomingRing();
        void sendCallSignal(supabase, c.peer.id, 'call_ringing', { roomName, ringerId: userRef.current?.id });
        clearRingTimer();
        // The caller records the missed call; this side just stops ringing.
        ringTimer.current = setTimeout(() => {
            const now = callRef.current;
            if (now?.id === roomName && now.phase === 'incoming') finish(now, { message: `Missed Call From ${c.peer.name}` });
        }, CALL_RING_TIMEOUT_MS + 5000);
    }, [cancelPending, clearRingTimer, finish, setCall, startIncomingRing, stopRinging]);

    const acceptRef = useRef(null);
    const accept = useCallback(() => {
        const c = callRef.current;
        if (!c || c.role !== 'callee' || c.phase !== 'incoming') return;
        clearRingTimer();
        stopRinging();
        const answered = { ...c, phase: 'active', answeredAt: Date.now() };
        setCall(answered);
        void sendCallSignal(supabase, c.peer.id, 'call_accepted', { roomName: c.id, accepterId: userRef.current?.id });
        void sendToOwnDevices('call_handled', { roomName: c.id });
        // A room from a not-yet-updated caller is still authorised by its
        // pending row; deleting it now would refuse this side's token. It
        // expires on its own within two minutes.
        if (parseCallRoomConversation(c.id)) cancelPending(c);
    }, [cancelPending, clearRingTimer, setCall, stopRinging]);
    acceptRef.current = accept;

    const decline = useCallback(() => {
        const c = callRef.current;
        if (!c || c.role !== 'callee' || c.phase !== 'incoming') return;
        finished.current.add(c.id);
        clearRingTimer();
        stopRinging();
        void sendCallSignal(supabase, c.peer.id, 'call_declined', { roomName: c.id, reason: 'declined', declinerId: userRef.current?.id });
        void sendToOwnDevices('call_handled', { roomName: c.id });
        cancelPending(c);
        setCall(null);
    }, [cancelPending, clearRingTimer, setCall, stopRinging]);

    const hangup = useCallback(() => {
        const c = callRef.current;
        if (!c) return;
        if (c.role === 'callee' && c.phase === 'incoming') { decline(); return; }
        finish(c, { notifyPeer: true, unanswered: 'cancelled', message: 'Call Ended' });
    }, [decline, finish]);

    // Realtime topics are public, so a ring is shown only for a call the
    // server actually created (/api/calls/create wrote the pending row before
    // the signal was sent). A network failure rings anyway rather than drop a
    // real call; an explicit "no such call" does not ring.
    const verifyAndRing = useCallback(async payload => {
        try {
            const response = await authedFetch('/api/calls/pending');
            if (response.ok) {
                const result = await response.json().catch(() => null);
                const pending = result?.pendingCall;
                if (result?.success && (!pending || pending.roomName !== payload.roomName || pending.callerId !== payload.callerId)) return;
                if (pending) {
                    ringFor({ ...payload, callerName: pending.callerName || payload.callerName, callerAvatar: pending.callerAvatar ?? payload.callerAvatar, callType: pending.callType || payload.callType, pendingCallId: pending.id });
                    return;
                }
            }
        } catch { /* fall through and ring */ }
        ringFor(payload);
    }, [ringFor]);

    // ── Signals ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user?.id) { stopCallSignal(); return undefined; }
        startCallSignal(supabase, user.id);
        const matches = (c, payload, senderKey) => (payload.roomName ? c.id === payload.roomName : c.peer.id === payload[senderKey]);
        const stop = onCallSignal((event, payload) => {
            const c = callRef.current;
            if (event === 'incoming_call') {
                if (!payload.callerId || payload.callerId === userRef.current?.id || !payload.roomName) return;
                void verifyAndRing(payload);
                return;
            }
            if (!c) return;
            if (event === 'call_ringing' && c.role === 'caller' && c.phase === 'outgoing' && c.id === payload.roomName) {
                if (c.reach !== 'ringing') setCall({ ...c, reach: 'ringing' });
                return;
            }
            if (event === 'call_accepted' && c.role === 'caller' && c.phase === 'outgoing' && matches(c, payload, 'accepterId')) {
                clearRingTimer();
                stopRinging();
                setCall({ ...c, phase: 'active', answeredAt: Date.now() });
            } else if (event === 'call_declined' && c.role === 'caller' && c.phase === 'outgoing' && matches(c, payload, 'declinerId')) {
                const busy = payload.reason === 'busy';
                const timeout = payload.reason === 'timeout';
                // notifyPeer: a device of theirs that answered while another
                // declined (or is still ringing) must stop too.
                finish(c, { notifyPeer: true, unanswered: busy || timeout ? 'missed' : 'declined', missedNotice: timeout, message: busy ? `${c.peer.name} Is On Another Call` : timeout ? 'No Answer' : 'Call Declined' });
            } else if (event === 'call_ended' && matches(c, payload, 'enderId')) {
                finish(c, { message: c.phase === 'incoming' ? `Missed Call From ${c.peer.name}` : 'Call Ended' });
            } else if (event === 'call_handled' && c.role === 'callee' && c.phase === 'incoming' && c.id === payload.roomName) {
                // Answered or declined on this user's other device.
                finished.current.add(c.id);
                clearRingTimer();
                stopRinging();
                setCall(null);
            }
        });
        // SECOND RING PATH (2026-10-31). The incoming call is also written to
        // the callee's notifications as a bell row, the same realtime stream
        // that updates the header bell on every page. If the call signal does
        // not reach this page, the bell row still rings it. ringFor ignores a
        // room that is already ringing or finished, so both paths arriving
        // rings once; verifyAndRing drops a call that is no longer pending.
        let ringChannel = null;
        try {
            ringChannel = supabase
                .channel(`call-ring-notifications:${user.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, message => {
                    const row = message?.new;
                    if (row?.type !== 'incoming_call') return;
                    const data = row.data || {};
                    if (!data.roomName || !data.callerId || data.callerId === userRef.current?.id) return;
                    if (callRef.current?.id === data.roomName || finished.current.has(data.roomName)) return;
                    void verifyAndRing({
                        roomName: data.roomName, callerId: data.callerId, conversationId: data.conversationId,
                        callType: data.callType, callerName: data.callerName, callerAvatar: data.callerAvatar || null,
                    });
                })
                .subscribe();
        } catch (error) {
            console.warn('[CallProvider] ringing notification listener unavailable:', error?.message || error);
        }
        return () => {
            stop();
            if (ringChannel) { try { supabase.removeChannel(ringChannel); } catch { /* already gone */ } }
        };
    }, [user?.id, clearRingTimer, finish, verifyAndRing, setCall, stopRinging]);

    // ── Calls that rang while this page was closed (push notifications) ─────
    const checkPending = useCallback(async ({ autoAnswerRoom = null } = {}) => {
        if (!userRef.current?.id || callRef.current) return;
        lastPendingCheck.current = Date.now();
        try {
            const response = await authedFetch('/api/calls/pending', { headers: { Authorization: `Bearer ${getAccessToken() || ''}` } });
            if (!response.ok) return;
            const result = await response.json();
            const pending = result?.pendingCall;
            if (!pending?.roomName) return;
            const age = Date.now() - Date.parse(pending.createdAt || 0);
            if (!(age >= 0 && age < CALL_RING_TIMEOUT_MS + 5000)) return;
            ringFor({ ...pending, pendingCallId: pending.id });
            if (autoAnswerRoom && autoAnswerRoom === pending.roomName) accept();
        } catch (error) {
            console.warn('[CallProvider] pending call check failed:', error?.message || error);
        }
    }, [accept, ringFor]);

    useEffect(() => {
        if (!user?.id) return undefined;
        const query = router?.query || {};
        const room = typeof query.incomingCall === 'string' ? query.incomingCall : null;
        void checkPending({ autoAnswerRoom: room && query.answer === '1' ? room : null });
        const visible = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastPendingCheck.current > 5000) void checkPending();
        };
        // RECONNECT (2026-10-31). A call that rang while this page was frozen,
        // offline or between sockets left no broadcast and no notification
        // event behind. Re-check when the realtime listener rejoins, when the
        // network comes back and when the page is restored from the back/forward
        // cache, not only when it becomes visible.
        const recheck = () => { if (Date.now() - lastPendingCheck.current > 2000) void checkPending(); };
        const stopRejoin = onCallSignal(event => { if (event === 'resubscribed') recheck(); });
        document.addEventListener('visibilitychange', visible);
        window.addEventListener('online', recheck);
        window.addEventListener('pageshow', recheck);
        return () => {
            document.removeEventListener('visibilitychange', visible);
            window.removeEventListener('online', recheck);
            window.removeEventListener('pageshow', recheck);
            stopRejoin();
        };
    }, [user?.id, router?.query?.incomingCall]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Closing the page mid-call ───────────────────────────────────────────
    useEffect(() => {
        const unload = () => {
            const c = callRef.current;
            if (!c) return;
            const self = userRef.current?.id;
            const event = c.role === 'callee' && c.phase === 'incoming' ? 'call_declined' : 'call_ended';
            beaconCallSignal({ url: SUPABASE_URL, apiKey: SUPABASE_ANON_KEY, accessToken: getAccessToken() }, c.peer.id, event,
                event === 'call_declined' ? { roomName: c.id, reason: 'declined', declinerId: self } : { roomName: c.id, enderId: self });
            const token = getAccessToken();
            if (token && self) {
                try {
                    fetch('/api/calls/cancel', {
                        method: 'POST', keepalive: true,
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify(c.role === 'caller' ? { callerId: self, calleeId: c.peer.id, roomName: c.id } : { callerId: c.peer.id, calleeId: self, roomName: c.id }),
                    }).catch(() => {});
                } catch { /* closing */ }
            }
        };
        window.addEventListener('pagehide', unload);
        return () => window.removeEventListener('pagehide', unload);
    }, []);

    useEffect(() => () => { clearRingTimer(); stopRinging(); }, [clearRingTimer, stopRinging]);

    // Signing out ends any call.
    useEffect(() => {
        if (!user && callRef.current) finish(callRef.current, { notifyPeer: true });
    }, [user, finish]);

    const handleRemoteLeft = useCallback(() => {
        const c = callRef.current;
        if (c && c.phase === 'active') finish(c, { notifyPeer: true, message: 'Call Ended' });
    }, [finish]);
    const handleConnectionLost = useCallback(duplicate => {
        const c = callRef.current;
        if (!c || c.phase === 'incoming') return;
        // Answered on another of this user's devices: only this screen closes.
        if (duplicate) { finished.current.add(c.id); clearRingTimer(); stopRinging(); setCall(null); toast.info('Call Moved To Your Other Device'); return; }
        finish(c, { notifyPeer: true, message: 'Call Disconnected' });
    }, [clearRingTimer, finish, setCall, stopRinging]);
    const handleFatal = useCallback(messageText => {
        const c = callRef.current;
        if (c && c.phase !== 'incoming') finish(c, { notifyPeer: true, message: messageText || 'Could Not Connect The Call' });
    }, [finish]);
    const handleNotice = useCallback(messageText => { if (messageText) toast.info(messageText, 6000); }, []);

    const value = useMemo(() => ({ startCall, activeCall: call, hangup }), [startCall, call, hangup]);

    return (
        <CallContext.Provider value={value}>
            {children}
            <CallOverlayBoundary callId={call?.id || null} onFailure={() => { const c = callRef.current; if (c) finish(c, { notifyPeer: true, message: 'The Call Screen Failed To Load. Please Try Again.' }); }}>
            {call && call.role === 'callee' && call.phase === 'incoming' && (
                <IncomingCallScreen call={call} onAccept={accept} onDecline={decline} />
            )}
            {call && (call.phase === 'outgoing' || call.phase === 'active') && (
                <CallScreen
                    key={call.id}
                    call={call}
                    selfName={publicName(user)}
                    onHangup={hangup}
                    onRemoteLeft={handleRemoteLeft}
                    onConnectionLost={handleConnectionLost}
                    onFatal={handleFatal}
                    onNotice={handleNotice}
                />
            )}
            </CallOverlayBoundary>
        </CallContext.Provider>
    );
}
