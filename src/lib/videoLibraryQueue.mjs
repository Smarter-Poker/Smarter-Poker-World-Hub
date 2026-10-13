export const QUEUE_STORAGE_KEY = 'video-library-session-queue-v1';
export const QUEUE_EVENT = 'video-library-queue-change';
export const MAX_QUEUE_ITEMS = 100;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const playlistPath = id => `/hub/video-library/playlists/${encodeURIComponent(id)}`;
export function normalizeQueueItems(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items.flatMap(item => {
        const videoId = item?.videoId;
        if (!VIDEO_ID.test(videoId || '') || seen.has(videoId)) return [];
        seen.add(videoId);
        return [{ videoId, title: String(item.title || 'Video').slice(0, 300), source: String(item.source || '').slice(0, 80), thumbnail: typeof item.thumbnail === 'string' && /^https:\/\//.test(item.thumbnail) ? item.thumbnail.slice(0, 2000) : null, duration: String(item.duration || '').slice(0, 30) }];
    }).slice(0, MAX_QUEUE_ITEMS);
}
export function shuffleQueueItems(items, random = Math.random) {
    const result = normalizeQueueItems(items);
    for (let index = result.length - 1; index > 0; index -= 1) {
        const value = random();
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Shuffle Could Not Be Prepared.');
        const target = Math.floor(value * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
}
export function emptyQueue(ownerId = null) { return { version: 1, ownerId, items: [], currentId: null }; }
export function readQueue(ownerId = null, storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
    if (!storage) return emptyQueue(ownerId);
    const raw = storage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return emptyQueue(ownerId);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return emptyQueue(ownerId); }
    if (parsed?.version !== 1 || parsed.ownerId !== ownerId) return emptyQueue(ownerId);
    const items = normalizeQueueItems(parsed.items);
    return { version: 1, ownerId, items, currentId: items.some(item => item.videoId === parsed.currentId) ? parsed.currentId : items[0]?.videoId || null };
}
export function writeQueue(queue, ownerId = null, storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
    if (!storage) throw new Error('Session Queue Storage Is Unavailable.');
    const items = normalizeQueueItems(queue.items);
    const next = { version: 1, ownerId, items, currentId: items.some(item => item.videoId === queue.currentId) ? queue.currentId : items[0]?.videoId || null };
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_EVENT));
    return next;
}
export function startQueue(items, index = 0, ownerId = null) {
    const normalized = normalizeQueueItems(items);
    if (!normalized.length || !Number.isInteger(index) || index < 0 || index >= normalized.length) throw new Error('No Available Videos To Play.');
    return writeQueue({ items: normalized, currentId: normalized[index].videoId }, ownerId);
}
export function enqueueNext(video, currentVideoOrId, ownerId = null) {
    const currentId = typeof currentVideoOrId === 'string' ? currentVideoOrId : currentVideoOrId?.videoId;
    const item = normalizeQueueItems([video])[0];
    if (!item) throw new Error('This Video Cannot Be Queued.');
    const queue = readQueue(ownerId);
    if (item.videoId === currentId) return queue;
    let items = queue.items.filter(entry => entry.videoId !== item.videoId);
    let index = items.findIndex(entry => entry.videoId === currentId);
    if (index < 0) {
        const anchor = normalizeQueueItems([currentVideoOrId])[0];
        if (anchor) { items.unshift(anchor); index = 0; }
    }
    if (items.length >= MAX_QUEUE_ITEMS) throw new Error('The Session Queue Is Full. Remove A Video First.');
    items.splice(index + 1, 0, item);
    return writeQueue({ items, currentId: index >= 0 ? currentId : item.videoId }, ownerId);
}
export function advanceQueue(currentId, ownerId = null) {
    const queue = readQueue(ownerId);
    const index = queue.items.findIndex(item => item.videoId === currentId);
    const next = index >= 0 ? queue.items[index + 1] : queue.items[0];
    return writeQueue({ ...queue, currentId: next?.videoId || null, items: next ? queue.items.slice(index + 1) : [] }, ownerId);
}
export function removeQueueItem(videoId, ownerId = null) {
    const queue = readQueue(ownerId);
    return writeQueue({ ...queue, items: queue.items.filter(item => item.videoId !== videoId) }, ownerId);
}
export function clearQueue(ownerId = null) { return writeQueue(emptyQueue(ownerId), ownerId); }
