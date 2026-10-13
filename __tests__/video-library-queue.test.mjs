import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueueItems, shuffleQueueItems, readQueue, writeQueue, emptyQueue, QUEUE_STORAGE_KEY, startQueue, enqueueNext, advanceQueue, removeQueueItem, clearQueue } from '../src/lib/videoLibraryQueue.mjs';
const a = { videoId: 'abcdefghijk', title: 'First' };
const b = { videoId: 'bcdefghijkl', title: 'Second' };
const storage = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; };
test('Queue validates canonical IDs, deduplicates and bounds session payloads', () => {
    assert.deepEqual(normalizeQueueItems([a, a, { videoId: 'invalid' }, b]).map(item => item.videoId), [a.videoId, b.videoId]);
    assert.equal(normalizeQueueItems(Array.from({ length: 120 }, (_, index) => ({ videoId: String(index).padStart(11, '0') }))).length, 100);
});
test('Session snapshots persist and owner boundaries reject another account', () => {
    const session = storage();
    writeQueue({ items: [a, b], currentId: b.videoId }, 'owner-a', session);
    assert.equal(readQueue('owner-a', session).currentId, b.videoId);
    assert.deepEqual(readQueue('owner-b', session), emptyQueue('owner-b'));
    assert.deepEqual(readQueue(null, session), emptyQueue(null));
    session.setItem(QUEUE_STORAGE_KEY, '{bad');
    assert.deepEqual(readQueue('owner-a', session), emptyQueue('owner-a'));
});
test('Storage failure is explicit and shuffle preserves exactly the valid members', () => {
    assert.throws(() => writeQueue({ items: [a] }, null, { setItem() { throw new Error('denied'); } }), /denied/);
    assert.deepEqual(shuffleQueueItems([a, b], () => 0).map(item => item.videoId), [b.videoId, a.videoId]);
    assert.throws(() => shuffleQueueItems([a, b], () => 1), /Shuffle/);
});

test('Play Next anchors the real current video, moves duplicate next items, consumes and clears', () => {
    const session = storage();
    let notifications = 0;
    globalThis.window = { sessionStorage: session, dispatchEvent() { notifications += 1; } };
    try {
        const c = { videoId: 'cdefghijklm', title: 'Third' };
        assert.deepEqual(enqueueNext(b, a, 'owner').items.map(item => item.videoId), [a.videoId,b.videoId]);
        startQueue([a,b,c],0,'owner');
        assert.deepEqual(enqueueNext(c,a,'owner').items.map(item => item.videoId), [a.videoId,c.videoId,b.videoId]);
        assert.deepEqual(enqueueNext(c,a,'owner').items.map(item => item.videoId), [a.videoId,c.videoId,b.videoId]);
        assert.equal(advanceQueue(a.videoId,'owner').currentId,c.videoId);
        assert.deepEqual(readQueue('owner').items.map(item=>item.videoId),[c.videoId,b.videoId]);
        removeQueueItem(b.videoId,'owner');
        assert.deepEqual(advanceQueue(c.videoId,'owner').items,[]);
        startQueue([a,b],0,'owner'); clearQueue('owner');
        assert.deepEqual(readQueue('owner'),emptyQueue('owner'));
        assert.ok(notifications >= 8);
    } finally { delete globalThis.window; }
});
