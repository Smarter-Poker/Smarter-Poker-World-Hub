// MESSENGER CALLS WORK (2026-10-31).
//
// Dan: "THE PHONE AND VIDEO CALLING NEEDS TO BE FULLY AUDITED. ITS NOT
// WORKING." and "I TRIED MAKING A CALL TO ART HARB (BURLS) THE OTHER DAY AND
// IT SILENTLY FAILED." Each test below pins one root cause found in the audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
    makeCallRoomName, parseCallRoomConversation, callReceiptContent, formatCallDuration,
    CALL_RING_TIMEOUT_MS, normalizeCallType,
} from '../src/lib/calls/callRoom.mjs';
import { authorizeCallConversation } from '../src/lib/calls/callAuthorization.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const CONVERSATION = '81550e58-5043-4eb6-ba54-b746bb83c306';
const ME = '47965354-0e56-43ef-931c-ddaab82af765';
const THEM = '7e616640-58dd-4d8d-a18e-2f37f057bcd9';

test('a call room names its conversation and round-trips', () => {
    const room = makeCallRoomName(CONVERSATION, 1793500000000, () => 0.5);
    assert.match(room, /^sp-call-81550e58-5043-4eb6-ba54-b746bb83c306-[a-z0-9]+$/);
    assert.equal(parseCallRoomConversation(room), CONVERSATION);
    assert.equal(parseCallRoomConversation(room.toUpperCase()), CONVERSATION);
    assert.equal(parseCallRoomConversation('smarter-poker-81550e58-1793500000000'), null);
    assert.equal(parseCallRoomConversation(`sp-call-${CONVERSATION}`), null);
    assert.equal(parseCallRoomConversation(`sp-call-${CONVERSATION}-x;drop`), null);
    assert.equal(parseCallRoomConversation(null), null);
    assert.throws(() => makeCallRoomName('not-a-conversation'));
    assert.notEqual(makeCallRoomName(CONVERSATION), makeCallRoomName(CONVERSATION));
});

test('one receipt format, durations and types are normalised', () => {
    assert.equal(callReceiptContent({ callType: 'video', status: 'completed', durationSeconds: 61.9 }), '[CALL_RECEIPT]{"type":"video","duration":61,"status":"completed"}');
    assert.equal(callReceiptContent({ callType: 'voice', status: 'bogus' }), '[CALL_RECEIPT]{"type":"audio","duration":0,"status":"completed"}');
    assert.equal(callReceiptContent({ callType: 'audio', status: 'missed', durationSeconds: -4 }), '[CALL_RECEIPT]{"type":"audio","duration":0,"status":"missed"}');
    assert.equal(formatCallDuration(42), '0:42');
    assert.equal(formatCallDuration(3725), '1:02:05');
    assert.equal(normalizeCallType('video'), 'video');
    assert.equal(normalizeCallType('anything'), 'audio');
    assert.ok(CALL_RING_TIMEOUT_MS >= 30000 && CALL_RING_TIMEOUT_MS <= 60000);
});

function fakeSupabase({ conversation, participants, blocks = [], failOn = null }) {
    return {
        from(table) {
            const state = { table };
            const builder = {
                select() { return builder; }, eq() { return builder; }, or() { return builder; }, limit() { return builder; },
                maybeSingle: async () => (failOn === table ? { data: null, error: { message: 'down' } } : { data: conversation, error: null }),
                then(resolve) {
                    if (failOn === state.table) return resolve({ data: null, error: { message: 'down' } });
                    if (state.table === 'social_conversation_participants') return resolve({ data: participants.map(user_id => ({ user_id })), error: null });
                    if (state.table === 'messenger_blocked') return resolve({ data: blocks, error: null });
                    return resolve({ data: [], error: null });
                },
            };
            return builder;
        },
    };
}

test('the call conversation is authorised from the conversation itself', async () => {
    const ok = await authorizeCallConversation(fakeSupabase({ conversation: { id: CONVERSATION, is_group: false, is_request: false }, participants: [ME, THEM] }), { conversationId: CONVERSATION, userId: ME });
    assert.deepEqual(ok, { ok: true, otherUserId: THEM });
    const outsider = await authorizeCallConversation(fakeSupabase({ conversation: { id: CONVERSATION, is_group: false, is_request: false }, participants: [ME, THEM] }), { conversationId: CONVERSATION, userId: '00000000-0000-4000-8000-000000000000' });
    assert.equal(outsider.ok, false); assert.equal(outsider.status, 403);
    const group = await authorizeCallConversation(fakeSupabase({ conversation: { id: CONVERSATION, is_group: true, is_request: false }, participants: [ME, THEM] }), { conversationId: CONVERSATION, userId: ME });
    assert.equal(group.ok, false);
    const request = await authorizeCallConversation(fakeSupabase({ conversation: { id: CONVERSATION, is_group: false, is_request: true }, participants: [ME, THEM] }), { conversationId: CONVERSATION, userId: ME });
    assert.equal(request.ok, false); assert.match(request.error, /Message Request/);
    const blocked = await authorizeCallConversation(fakeSupabase({ conversation: { id: CONVERSATION, is_group: false, is_request: false }, participants: [ME, THEM], blocks: [{ blocker_id: THEM }] }), { conversationId: CONVERSATION, userId: ME });
    assert.equal(blocked.ok, false);
    const down = await authorizeCallConversation(fakeSupabase({ conversation: null, participants: [], failOn: 'social_conversations' }), { conversationId: CONVERSATION, userId: ME });
    assert.equal(down.ok, false); assert.equal(down.status, 503);
    const missing = await authorizeCallConversation(fakeSupabase({ conversation: null, participants: [] }), { conversationId: 'nope', userId: ME });
    assert.equal(missing.status, 400);
});

test('the LiveKit token authorises a call room by conversation, not by the pending row the answerer deletes', () => {
    const token = read('pages/api/livekit/token.js');
    assert.match(token, /parseCallRoomConversation\(roomName\)/);
    assert.match(token, /authorizeCallConversation\(sb, \{ conversationId: callConversationId, userId: _authUser\.id \}\)/);
    // The call-room branch decides before the legacy pending_calls lookup runs.
    assert.ok(token.indexOf('authorizeCallConversation(') < token.indexOf(".from('pending_calls')"));
});

test('call creation authorises the conversation, honours its refusal and rings the phone server-side', () => {
    const create = read('pages/api/calls/create.js');
    assert.match(create, /authorizeCallConversation\(sb, \{ conversationId, userId: callerId \}\)/);
    assert.match(create, /authorization\.otherUserId !== calleeId/);
    assert.match(create, /parseCallRoomConversation\(roomName\) !== conversationId/);
    // The ringing call is a bell row AND a push, from one notify() call.
    assert.match(create, /await notify\(sb, \{\s*userId: calleeId,\s*type: 'incoming_call',/);
    // Production: CHECK (call_type IN ('voice','video')). 'audio' failed every voice call.
    assert.match(create, /call_type: callType === 'video' \? 'video' : 'voice'/);
    assert.doesNotMatch(create, /call_type: callType,/);
    // Old-client rooms must look like old-client rooms, never a live-stream room.
    assert.match(create, /\^smarter-poker-\[0-9a-f\]\{8\}-/);
    assert.match(read('pages/api/livekit/token.js'), /authorized \|\| !legacyCallRoom \? \{ data: null \}/);
    assert.match(read('pages/api/calls/cancel.js'), /query = query\.eq\('room_name', roomName\)/);
    assert.match(create, /event: 'incoming_call'/);
    const send = read('pages/api/notifications/send.js');
    assert.match(send, /There is no call to this person in progress/);
});

test('a ringing call notifies on every page, not only inside Messenger', () => {
    const provider = read('src/components/calls/CallProvider.jsx');
    // Second ring path: the incoming_call bell row on the notifications stream.
    assert.match(provider, /channel\(`call-ring-notifications:\$\{user\.id\}`\)/);
    assert.match(provider, /table: 'notifications', filter: `user_id=eq\.\$\{user\.id\}`/);
    assert.match(provider, /if \(row\?\.type !== 'incoming_call'\) return;/);
    assert.match(provider, /void verifyAndRing\(\{\s*roomName: data\.roomName/);
    // CallProvider wraps every page, so both paths are live everywhere.
    assert.match(read('pages/_app.js'), /<CallProvider>/);
    // The ringing row is cleared once the call is handled.
    const cancel = read('pages/api/calls/cancel.js');
    assert.match(cancel, /\.eq\('type', 'incoming_call'\)\s*\.eq\('data->>roomName', roomName\)/);
    assert.match(cancel, /user_id\.eq\.\$\{authenticatedUserId\},actor_id\.eq\.\$\{authenticatedUserId\}/);
});

test('a call receipt is never announced as a message', () => {
    const send = read('pages/api/messenger/send-message.js');
    assert.match(send, /const isCallReceipt = String\(content \|\| ''\)\.startsWith\('\[CALL_RECEIPT\]'\);/);
    assert.match(send, /otherIds\.length > 0 && !isCallReceipt\)/);
});

test('sending a signal never creates, borrows or removes the user\'s own listener', () => {
    const signal = read('src/lib/calls/callSignal.js');
    assert.match(signal, /if \(toUserId === active\.userId\) return sendToOwnDevices\(event, body\);/);
    assert.match(signal, /const existed = /);
    assert.match(signal, /if \(!existed\) setTimeout\(\(\) => \{ try \{ client\.removeChannel\(channel\); \}/);
    for (const event of ['incoming_call', 'call_ringing', 'call_accepted', 'call_declined', 'call_ended', 'call_handled']) assert.ok(signal.includes(`'${event}'`), event);
});

test('Messenger no longer runs its own call machinery', () => {
    const page = read('pages/hub/messenger.js');
    assert.doesNotMatch(page, /call-signal:/);
    assert.doesNotMatch(page, /LiveKitCall|createRingTone|setIncomingCall|setShowCall|\/api\/calls\//);
    assert.match(page, /const \{ startCall: startAppCall \} = useCall\(\);/);
    assert.match(page, /aria-label="Start Voice Call"/);
    assert.match(page, /aria-label="Start Video Call"/);
    assert.match(page, /onCallBack=\{startCall\}/);
    assert.equal(existsSync(new URL('../src/components/video/LiveKitCall.jsx', import.meta.url)), false);
});

test('the chat header keeps phone and video on a phone screen', () => {
    const page = read('pages/hub/messenger.js');
    const header = page.slice(page.indexOf('{/* Chat Header */}'), page.indexOf('{/* Message Search Bar */}'));
    assert.match(header, /<div style=\{\{ flex: 1, minWidth: 0 \}\}>/);
    assert.match(header, /textOverflow: 'ellipsis'/);
    assert.match(header, /display: 'flex', gap: isMobile \? 2 : 8, flexShrink: 0/);
    assert.match(header, /width: 40, height: 40, borderRadius: '50%', flexShrink: 0/);
    assert.match(header, /!activeConversation\.is_group/);
});

test('every floating chat window has phone and video buttons and renders receipts as words', () => {
    const chat = read('src/components/messenger/dock/MessengerChat.jsx');
    assert.match(chat, /aria-label=\{`Voice Call \$\{name\}`\}/);
    assert.match(chat, /aria-label=\{`Video Call \$\{name\}`\}/);
    assert.match(chat, /requestCall\(\{ conversationId: id, otherUser: conversation\.otherUser/);
    assert.match(chat, /startsWith\('\[CALL_RECEIPT\]'\) \? <span className="dock-call-receipt">/);
});

test('the call provider is app-wide and fixes the lifecycle bugs', () => {
    const app = read('pages/_app.js');
    assert.match(app, /<CallProvider>/);
    const provider = read('src/components/calls/CallProvider.jsx');
    // Caller timeout: an unanswered call ends as missed instead of ringing forever.
    assert.match(provider, /finish\(current, \{ notifyPeer: true, unanswered: 'missed', missedNotice: true, message: 'No Answer' \}\)/);
    // Exactly one receipt, written by the caller.
    assert.match(provider, /if \(!c \|\| c\.role !== 'caller' \|\| !isConversationId\(c\.conversationId\)\) return;/);
    // Hang-up goes to the person on the call, not whichever chat is open.
    assert.match(provider, /sendCallSignal\(supabase, c\.peer\.id, 'call_ended'/);
    // A refused call stops instead of leaving the caller alone in a room.
    assert.match(provider, /if \(!created\.ok\) \{/);
    // Reachability: the caller is told when nothing can ring.
    assert.match(provider, /reach: 'unreachable'/);
    assert.match(read('src/components/calls/CallScreen.jsx'), /Has Notifications Turned Off, So This Call Cannot Ring For Them/);
    assert.match(provider, /'call_ringing'/);
    // Calls that rang while the page was closed, and Accept from the push.
    assert.match(provider, /\/api\/calls\/pending/);
    assert.match(provider, /query\.answer === '1'/);
    // A ring is only shown for a call the server created.
    assert.match(provider, /const verifyAndRing = useCallback/);
    // Both calling each other: the lower id keeps its call, the other answers it.
    assert.match(provider, /if \(self < details\.callerId\) return;/);
    // Busy: a second caller is told, not silently dropped.
    assert.match(provider, /reason: 'busy'/);
});

test('the call screen is phone-first', () => {
    const screen = read('src/components/calls/CallScreen.jsx');
    assert.match(screen, /useAudioPlayback/);
    assert.match(screen, /Tap To Turn On Sound/);
    assert.match(screen, /safe-area-inset-bottom/);
    assert.match(screen, /restartTrack\(\{ facingMode: next \}\)/);
    assert.doesNotMatch(screen, /screenShare: true/);
    assert.match(screen, /REMOTE_LEFT_GRACE_MS = 8000/);
    assert.match(screen, /JOIN_TIMEOUT_MS = 25000/);
    // Never blame the other person for this device's own failed connection.
    assert.match(screen, /CONNECT_TIMEOUT_MS = 40000/);
    assert.match(screen, /connected \? JOIN_TIMEOUT_MS : CONNECT_TIMEOUT_MS/);
    assert.match(screen, /if \(call\.creating\) return undefined;/);
    // Switching chats during a call: minimize keeps the room and audio mounted.
    assert.match(screen, /aria-label="Minimize Call"/);
    assert.match(screen, /aria-label="Return To Call"/);
    assert.match(screen, /if \(minimized\) return <MiniBar/);
    assert.match(screen, /extras=\{<>[\s\S]*<RoomAudioRenderer \/>/);
    for (const file of ['src/components/calls/CallScreen.jsx', 'src/components/calls/IncomingCallScreen.jsx', 'src/components/calls/CallProvider.jsx']) {
        assert.doesNotMatch(read(file), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${file} must not contain emoji`);
    }
});

test('Accept on the push notification answers the call', () => {
    for (const worker of ['public/push/sw.js', 'worker/index.js']) {
        const source = read(worker);
        assert.match(source, /event\.action === 'accept' && baseUrl\.indexOf\('incomingCall='\) !== -1/, worker);
    }
});

test('every hamburger menu offers Turn On Notifications until this device receives push', async () => {
    const menu = read('src/components/ui/HamburgerMenu.jsx');
    assert.match(menu, /import \{ pushMenuState, PUSH_MENU_DESTINATIONS \} from '\.\.\/\.\.\/lib\/pushMenuState\.mjs';/);
    assert.match(menu, /if \(!isOpen \|\| !getAuthUser\(\)\) \{ setPushRow\(null\); return undefined; \}/);
    assert.match(menu, /if \(pushRow && !links\.some\(\(i\) => matchesId\(i, 'turn-on-notifications'\)\)\)/);
    assert.match(menu, /label: 'Turn On Notifications',/);
    // The permission prompt is requested inside the tap: nothing awaited first.
    assert.match(menu, /const pending = push\.subscribe\(\);\n    if \(typeof onClose === 'function'\) onClose\(\);/);
    assert.match(menu, /router\.push\(PUSH_MENU_DESTINATIONS\[pushRow\]/);

    const { pushMenuState, PUSH_MENU_DESTINATIONS } = await import('../src/lib/pushMenuState.mjs');
    const client = (o = {}) => ({ isWebPushSupported: () => true, isIos: () => false, isIosStandalonePwa: () => false, notificationPermission: () => 'default', hasLocalSubscription: async () => false, ...o });
    assert.equal(await pushMenuState(client()), 'ask', 'eligible');
    assert.equal(await pushMenuState(client({ notificationPermission: () => 'granted', hasLocalSubscription: async () => true })), null, 'already enabled');
    assert.equal(await pushMenuState(client({ notificationPermission: () => 'granted' })), 'ask', 'granted without a subscription');
    assert.equal(await pushMenuState(client({ notificationPermission: () => 'denied' })), 'blocked', 'denied');
    assert.equal(await pushMenuState(client({ isWebPushSupported: () => false, isIos: () => true })), 'install', 'iOS Safari tab');
    assert.equal(await pushMenuState(client({ isWebPushSupported: () => false })), null, 'unsupported browser');
    assert.equal(await pushMenuState(client({ hasLocalSubscription: async () => { throw new Error('x'); } })), 'ask', 'lookup failed');
    assert.deepEqual(PUSH_MENU_DESTINATIONS, { install: '/hub/install', blocked: '/hub/settings/notifications' });
});

test('a call that rang while the page was frozen, offline or between sockets rings on reconnect', () => {
    const signal = read('src/lib/calls/callSignal.js');
    assert.match(signal, /if \(joinedBefore\) dispatch\('resubscribed', \{\}\);/);
    const provider = read('src/components/calls/CallProvider.jsx');
    assert.match(provider, /onCallSignal\(event => \{ if \(event === 'resubscribed'\) recheck\(\); \}\)/);
    assert.match(provider, /window\.addEventListener\('online', recheck\);/);
    assert.match(provider, /window\.addEventListener\('pageshow', recheck\);/);
    assert.match(provider, /document\.addEventListener\('visibilitychange', visible\);/);
});

test('an open page picks up a new build, but never by reloading under a call', () => {
    const updater = read('src/components/ui/ServiceWorkerUpdater.jsx');
    assert.match(updater, /document\.addEventListener\('visibilitychange', onVisible\);/);
    assert.match(updater, /setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) void recheck\(\); \}, 15 \* 60 \* 1000\)/);
    assert.match(updater, /if \(typeof window !== 'undefined' && window\.__spCallActive\) \{\s*callReloadDeferred = true;\s*return;/);
    assert.match(updater, /window\.addEventListener\('sp-call-idle', onCallIdle\);/);
    const provider = read('src/components/calls/CallProvider.jsx');
    assert.match(provider, /window\.__spCallActive = Boolean\(value\);/);
    assert.match(provider, /if \(wasActive && !value\) window\.dispatchEvent\(new Event\('sp-call-idle'\)\);/);
});
