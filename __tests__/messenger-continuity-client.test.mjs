import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONTINUITY_PREFIX, createContinuityController, readLocalContinuity, visibleMessageBoundary } from '../src/lib/messengerContinuity.mjs';

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const actor = id(1), conversation = id(2), other = id(3), message = id(4);
const value = (text = '', revision = 0) => ({ draft: { text, replyToId: null, revision }, pin: { value: false, revision: 0 }, position: { messageId: null, offset: 0, revision: 0 } });
const response = body => ({ ok: true, status: 200, body: { success: true, ...body } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function storage() {
    const data = new Map();
    return { get length() { return data.size; }, key: index => [...data.keys()][index], getItem: key => data.get(key) || null,
        setItem: (key, item) => data.set(key, item), removeItem: key => data.delete(key), data };
}
function setup(options = {}) {
    const disk = options.storage || storage(), calls = [];
    const controller = createContinuityController({ actorId: actor, workspace: { workspace: 'social', folder: 'messages' }, storage: disk,
        request: async body => { calls.push(body); return options.reply ? options.reply(body, calls.length) : response({ revision: body.expectedRevision + 1, value: body.value }); }, ...options });
    return { controller, disk, calls };
}

test('draft is recovered synchronously only for its actor and conversation; unscoped old pins are ignored', () => {
    const { controller, disk } = setup(); disk.setItem('sp-pinned-conversations', JSON.stringify([other]));
    controller.edit(conversation, 'draft', { text: 'Local draft', replyToId: message });
    assert.equal(readLocalContinuity(disk, actor, conversation).draft.text, 'Local draft');
    assert.equal(readLocalContinuity(disk, other, conversation).draft.text, '');
    assert.equal(readLocalContinuity(disk, actor, other).draft.text, '');
    assert.deepEqual(controller.pins, []);
});
test('corrupt or cross-account local records are ignored', () => {
    const disk = storage(), key = `${CONTINUITY_PREFIX}${actor}:${conversation}`;
    for (const raw of ['{', 'x'.repeat(16385), JSON.stringify({ actorId: other, conversationId: conversation, ...value('private') })]) {
        disk.setItem(key, raw); assert.equal(readLocalContinuity(disk, actor, conversation).draft.text, '');
    }
});
test('reading 1000 empty conversations consumes no draft storage; a real draft still persists', async () => {
    const { controller, disk } = setup({ reply: () => response({ states: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [id(100 + i), value()])), pins: [], saved: [] }) });
    await controller.read(); assert.equal(disk.length, 0);
    controller.edit(conversation, 'draft', { text: 'Kept', replyToId: null }); assert.equal(disk.length, 1);
});
test('dirty empty clearing intent persists until the server acknowledges it', async () => {
    const { controller, disk } = setup(); controller.edit(conversation, 'draft', { text: 'A', replyToId: null });
    controller.edit(conversation, 'draft', { text: '', replyToId: null }); assert.equal(disk.length, 1);
    await controller.write(conversation, 'draft'); assert.equal(disk.length, 0);
});
test('a delayed initial read cannot erase text typed after dispatch', async () => {
    const wait = deferred(), { controller } = setup({ reply: () => wait.promise });
    const read = controller.read(conversation); controller.edit(conversation, 'draft', { text: 'New typing', replyToId: null });
    wait.resolve(response({ state: value(), pins: [], saved: [] })); await read;
    assert.equal(controller.state(conversation).draft.text, 'New typing'); assert.equal(controller.state(conversation).draft.dirty, true);
});
test('receipt for A keeps newer draft B and coalesces only that explicit edit at the next revision', async () => {
    const wait = deferred(), { controller, calls } = setup({ reply: (body, count) => count === 1 ? wait.promise : response({ revision: 2, value: body.value }) });
    controller.edit(conversation, 'draft', { text: 'A', replyToId: null }); const save = controller.write(conversation, 'draft'); await tick();
    controller.edit(conversation, 'draft', { text: 'B', replyToId: null }); void controller.write(conversation, 'draft');
    wait.resolve(response({ revision: 1, value: { text: 'A', replyToId: null } })); await save; await tick();
    assert.equal(calls.length, 2); assert.equal(calls[1].value.text, 'B'); assert.equal(calls[1].expectedRevision, 1);
    assert.equal(controller.state(conversation).draft.text, 'B'); assert.equal(controller.state(conversation).draft.dirty, false);
});
test('failed A is not retried automatically; explicit retry sends current B', async () => {
    const wait = deferred(), { controller, calls } = setup({ reply: (body, count) => count === 1 ? wait.promise : response({ revision: 1, value: body.value }) });
    controller.edit(conversation, 'draft', { text: 'A', replyToId: null }); const save = controller.write(conversation, 'draft'); await tick();
    controller.edit(conversation, 'draft', { text: 'B', replyToId: null }); void controller.write(conversation, 'draft');
    wait.resolve({ ok: false, status: 503, body: { error: 'Unavailable' } }); await save; await tick();
    assert.equal(calls.length, 1); await controller.retry(controller.errors.get(`${conversation}:draft`));
    assert.equal(calls[1].value.text, 'B'); assert.equal(controller.state(conversation).draft.dirty, false);
});
test('send acknowledgment clears only the captured unchanged draft', async () => {
    const { controller } = setup(); controller.edit(conversation, 'draft', { text: 'A', replyToId: null });
    const captured = controller.state(conversation).draft; controller.edit(conversation, 'draft', { text: 'B', replyToId: null });
    assert.equal(controller.clearDraftIfUnchanged(conversation, captured), false);
    assert.equal(controller.clearDraftIfUnchanged(conversation, controller.state(conversation).draft), true);
    await tick(); assert.equal(controller.state(conversation).draft.text, '');
});
test('draft CAS conflict preserves local text until an explicit Keep uses the authoritative revision', async () => {
    const { controller, calls } = setup({ reply: (body, count) => count === 1 ? { ok: false, status: 409, body: { error: 'Changed', revision: 7, value: { text: 'Remote', replyToId: null } } } : response({ revision: 8 }) });
    controller.edit(conversation, 'draft', { text: 'Local', replyToId: null }); await controller.write(conversation, 'draft');
    assert.equal(controller.state(conversation).draft.text, 'Local'); assert.equal(controller.state(conversation).draft.conflict, true);
    await controller.write(conversation, 'draft'); assert.equal(calls.length, 1);
    await controller.resolve(conversation, 'draft', true); assert.equal(calls[1].expectedRevision, 7); assert.equal(calls[1].value.text, 'Local');
});
test('Use Saved Draft adopts remote without another write', async () => {
    const { controller, calls } = setup({ reply: () => ({ ok: false, status: 409, body: { revision: 3, value: { text: 'Remote', replyToId: message } } }) });
    controller.edit(conversation, 'draft', { text: 'Local', replyToId: null }); await controller.write(conversation, 'draft');
    controller.resolve(conversation, 'draft', false); assert.equal(calls.length, 1); assert.equal(controller.state(conversation).draft.text, 'Remote');
});
test('older storage events cannot replace a newer revision', async () => {
    const { controller, disk } = setup(); controller.edit(conversation, 'draft', { text: 'Newest', replyToId: null }); await controller.write(conversation, 'draft');
    disk.setItem(`${CONTINUITY_PREFIX}${actor}:${conversation}`, JSON.stringify({ actorId: actor, conversationId: conversation, ...value('Old', 0) }));
    controller.acceptLocal(conversation); assert.equal(controller.state(conversation).draft.text, 'Newest');
});
test('storage denial is visible without dropping the in-memory draft', () => {
    const { controller } = setup({ storage: { getItem() { throw Error('Denied'); } } });
    controller.edit(conversation, 'draft', { text: 'Kept', replyToId: null });
    assert.equal(controller.state(conversation).draft.text, 'Kept'); assert.match(controller.errors.get(`local:${conversation}`).message, /Denied/);
});
test('concurrent workspace and selected reads preserve unrelated pins and saved items', async () => {
    const first = deferred(), second = deferred();
    const { controller } = setup({ reply: (_, count) => count === 1 ? first.promise : second.promise });
    const a = controller.read(), b = controller.read(conversation);
    second.resolve(response({ state: { ...value(), pin: { value: true, revision: 1 } }, pins: [conversation], saved: [{ messageId: message, conversationId: conversation, saved: true, revision: 1 }] })); await b;
    first.resolve(response({ states: { [conversation]: value(), [other]: { ...value(), pin: { value: true, revision: 1 } } }, pins: [other], saved: [{ messageId: id(5), conversationId: other, saved: true, revision: 1 }] })); await a;
    assert.deepEqual(new Set(controller.pins), new Set([conversation, other]));
    assert.deepEqual(new Set(controller.saved.map(item => item.messageId)), new Set([message, id(5)]));
});
test('a selected read does not discard other conversations or workspace pagination', async () => {
    const { controller } = setup({ reply: () => response({ state: value(), pins: [], saved: [], hasMoreSaved: false, nextSavedCursor: null }) });
    controller.pins = [conversation, other]; controller.saved = [{ messageId: message, conversationId: other }]; controller.hasMoreSaved = true; controller.nextSavedCursor = { messageId: message };
    await controller.read(conversation); assert.deepEqual(controller.pins, [other]); assert.equal(controller.saved.length, 1); assert.equal(controller.hasMoreSaved, true);
});
test('removal retains tombstone revision for re-save and current-page metadata covers older saved pages', async () => {
    const { controller, calls } = setup(); controller.ingestSavedItems([{ messageId: message, conversationId: conversation, saved: true, revision: 11 }]);
    assert.equal(controller.savedState(message).saved, true);
    await controller.write(conversation, 'saved', { messageId: message, saved: false });
    await controller.write(conversation, 'saved', { messageId: message, saved: true });
    assert.deepEqual(calls.map(call => call.expectedRevision), [11, 12]);
});
test('broadcast removal cannot be resurrected by an older read response', async () => {
    const wait = deferred(), { controller } = setup({ reply: () => wait.promise });
    controller.ingestSavedItems([{ messageId: message, conversationId: conversation, saved: true, revision: 1 }]);
    controller.acceptCommit(conversation, { field: 'saved', revision: 2, value: { messageId: message, saved: false } });
    wait.resolve(response({ state: value(), saved: [{ messageId: message, conversationId: conversation, saved: true, revision: 1 }], pins: [] })); await tick();
    assert.equal(controller.savedState(message).saved, false); assert.equal(controller.saved.length, 0);
});
test('late account response cannot update the former owner or start another write', async () => {
    let active = true; const wait = deferred(), { controller, calls } = setup({ isCurrent: () => active, reply: () => wait.promise });
    const read = controller.read(conversation); active = false; wait.resolve(response({ state: value('Private'), pins: [conversation], saved: [] })); await read;
    await controller.write(conversation, 'pin', true); assert.equal(calls.length, 1); assert.equal(controller.state(conversation).draft.text, '');
});
test('read boundary excludes zero-height placeholders, offscreen rows and temporary IDs', () => {
    const node = (messageId, top, bottom, width = 300) => ({ dataset: { messageId }, getBoundingClientRect: () => ({ top, bottom, left: 0, right: width, height: bottom - top }) });
    const container = { ownerDocument: { defaultView: { innerHeight: 400 } }, getBoundingClientRect: () => ({ top: 100, bottom: 5000 }),
        querySelectorAll: () => [node(message, 100, 100), node(id(5), 90, 125), node('temp-1', 125, 150), node(id(6), 150, 200), node(id(7), 450, 500)] };
    assert.deepEqual(visibleMessageBoundary(container), { first: id(5), last: id(6), offset: -10 });
});
function sendHarness(source) {
    const start = source.indexOf('    const handleSend = () => {'), end = source.indexOf('\n    const handleThumbsUp', start);
    let text = 'My draft', controls;
    const set = value => { text = typeof value === 'function' ? value(text) : value; };
    new Function('text', 'onSend', 'setText', 'setLocalText', 'onDraftChange', 'setShowEmoji', 'navigator', 'inputRef', source.slice(start, end) + '\nhandleSend();')(
        text, (_, options) => { controls = options; }, set, set, undefined, () => {}, {}, { current: null });
    return { text: () => text, set, controls };
}
test('composer baseline reproduces immediate draft loss before a rejected send; new composer waits for durable recording', () => {
    const file = 'src/components/messenger/MessageInput.js';
    // Maintained minimal source fixture from f450a081; CI needs no historical Git objects.
    const baseline = `    const handleSend = () => {
        if (!text.trim()) return;
        onSend(text.trim());
        setText('');
    };
    const handleThumbsUp = () => {};`;
    assert.equal(sendHarness(baseline).text(), '', 'prior composer drops text before send acceptance');
    const current = sendHarness(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    assert.equal(current.text(), 'My draft'); assert.equal(current.controls.consumeDraft, true);
    current.set('New typing'); current.controls.onRecorded(); assert.equal(current.text(), 'New typing');
    const accepted = sendHarness(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')); accepted.controls.onRecorded(); assert.equal(accepted.text(), '');
});
test('page uses geometry-driven restoration and persistent composer account/conversation identity', () => {
    const page = fs.readFileSync(new URL('../pages/hub/messenger.js', import.meta.url), 'utf8');
    assert.match(page, /new ResizeObserver\(queuePlacement\)/); assert.match(page, /rows.some\(row => row.getBoundingClientRect\(\).height <= 0\)/);
    assert.match(page, /if \(controls.consumeDraft\) continuity.clearDraftIfUnchanged/);
    assert.match(page, /key=\{`\$\{user.id\}:\$\{activeConversation.id\}`\}/);
});

test('other workspace broadcasts cannot import club saved previews into social', async () => {
    const { controller, calls } = setup();
    controller.acceptCommit(conversation, { field: 'saved', revision: 2, value: { messageId: message, saved: true } }, { workspace: 'club', clubId: other, folder: 'invoices' });
    await tick(); assert.equal(calls.length, 0); assert.equal(controller.savedState(message).saved, false);
});
test('a saved response newer than the workspace list survives older workspace completion', async () => {
    const first = deferred(), second = deferred(), { controller } = setup({ reply: (_, count) => count === 1 ? first.promise : second.promise });
    const a = controller.read(), b = controller.read(conversation);
    second.resolve(response({ state: value(), pins: [], saved: [{ messageId: message, conversationId: conversation, saved: true, revision: 2, message: { content: 'Fresh' } }] })); await b;
    first.resolve(response({ pins: [], saved: [{ messageId: message, conversationId: conversation, saved: true, revision: 1, message: { content: 'Stale' } }] })); await a;
    assert.equal(controller.saved[0].message.content, 'Fresh');
});
test('a failed workspace read is not hidden by a successful selected-conversation read', async () => {
    const { controller } = setup({ reply: body => body.conversationId ? response({ state: value(), pins: [], saved: [] }) : { ok: false, status: 503, body: { error: 'Unavailable' } } });
    await controller.read(); await controller.read(conversation); assert.equal(controller.errors.has('read'), true);
});
test('draft and position debounce independently; pagehide flushes both finite writes', async () => {
    const source = fs.readFileSync(new URL('../src/hooks/useMessengerContinuity.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export default function', 'function');
    const timers = new Map(), listeners = new Map(), effects = [], disk = storage(), calls = [];
    let timerId = 0;
    const fakeWindow = { localStorage: disk, addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
    const factory = new Function('useEffect', 'useRef', 'useState', 'createContinuityController', 'CONTINUITY_PREFIX', 'isMessageId', 'broadcastSync', 'listenBroadcast', 'authedFetch', 'getAccessToken', 'window', 'document', 'setTimeout', 'clearTimeout', source + '\nreturn useMessengerContinuity;');
    const useHook = factory(callback => effects.push(callback), value => ({ current: value }), () => [0, () => {}], createContinuityController, CONTINUITY_PREFIX,
        input => /^[\da-f-]{36}$/i.test(input), () => {}, () => () => {}, async (_, options) => {
            const body = JSON.parse(options.body); calls.push(body); return { ok: true, status: 200, json: async () => body.action === 'read' ? { success: true, states: {}, pins: [], saved: [] } : { success: true, revision: body.expectedRevision + 1 } };
        }, () => 'local-fixture', fakeWindow, { visibilityState: 'visible' }, callback => { timers.set(++timerId, callback); return timerId; }, key => timers.delete(key));
    const hook = useHook({ actorId: actor, scope: 'one', workspace: { workspace: 'social' }, identityRef: { current: actor } });
    const cleanup = effects[0]();
    hook.edit(conversation, 'draft', { text: 'Typing', replyToId: null }); hook.edit(conversation, 'position', { messageId: message, offset: -4 });
    assert.equal(timers.size, 2); listeners.get('pagehide')({ type: 'pagehide' }); await tick();
    assert.deepEqual(new Set(calls.filter(call => call.action === 'write').map(call => call.field)), new Set(['draft', 'position']));
    assert.equal(timers.size, 0); cleanup();
});
